// Skkribe, Electron main process.
//
// Backend strategy proven by the original Skkribe electron build:
//   ffmpeg → split into N-second chunks → whisper.cpp transcribes chunks in
//   PARALLEL (multiple processes) → combine segments → pyannote.audio
//   diarizes the WHOLE WAV → segment-level speaker assignment via max overlap.
//
// Everything else (UI, settings storage, models cache) lives in the renderer.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn, spawnSync } = require('child_process')
const runtimeSetup = require('./runtime-setup')

// Bundled static ffmpeg binary. When the .app is launched from Finder it
// inherits a minimal PATH that doesn't include /opt/homebrew/bin, so a bare
// `ffmpeg` spawn ENOENTs. ffmpeg-static ships the binary in node_modules and
// returns its absolute path, works in both dev and packaged mode.
const FFMPEG_PATH = (() => {
  const p = require('ffmpeg-static')
  if (!app.isPackaged) return p
  // In a packaged build, electron-builder relocates node_modules under
  // app.asar.unpacked because the binary can't be loaded from inside an asar.
  // ffmpeg-static@5 sets `binary: { unpack: true }` so this rewrite is usually
  // automatic, but stay defensive in case it isn't.
  return p.replace('app.asar', 'app.asar.unpacked')
})()

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// Pipeline constants.
const PIPELINE = Object.freeze({
  chunkSeconds: 60,
  // How far (in seconds) a chunk boundary may slide to land on a silence.
  cutSearchWindow: 20,
})

// User-selectable quality/speed modes. `balanced` (large-v3 q5_0) is the
// first-run download and the default; the other two are fetched on demand the
// first time the user picks them.
//   fast: large-v3-turbo has a 4-layer decoder (vs 32) → several times faster
//         with a ~0.4pp average WER penalty; great for clean-ish recordings.
//   max:  full-precision large-v3, the best whisper can do; big and slow,
//         for when every rare word matters and time doesn't.
// `dtw` is the whisper.cpp attention-heads preset that enables token-level
// DTW timestamps for the word→speaker assignment.
const MODEL_MODES = Object.freeze({
  fast: {
    file: 'ggml-large-v3-turbo-q5_0.bin', dtw: 'large.v3.turbo',
    minBytes: 500 * 1024 * 1024, sizeLabel: '~574 MB', label: 'large-v3-turbo',
  },
  balanced: {
    file: 'ggml-large-v3-q5_0.bin', dtw: 'large.v3',
    minBytes: 900 * 1024 * 1024, sizeLabel: '~1,1 GB', label: 'large-v3',
  },
  max: {
    file: 'ggml-large-v3.bin', dtw: 'large.v3',
    minBytes: 2800 * 1024 * 1024, sizeLabel: '~3,1 GB', label: 'large-v3 (precisão total)',
  },
})
const MODEL_URL_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/'

// Per-subprocess timeouts. Whisper.cpp on CPU runs about real-time per chunk,
// so 10 min per 60s chunk is ~10× slowdown headroom, anything beyond that is
// a genuine hang (corrupted audio, OS locking, etc). Pyannote on CPU is
// ~1× realtime; for a 4-hour audio cap it at 6 hours.
const TIMEOUTS = Object.freeze({
  perChunkMs:  10 * 60 * 1000,        // whisper per chunk
  diarizeMs:   6 * 60 * 60 * 1000,    // pyannote on the full WAV
})

/** Whisper benefits from 2, 4 threads per process; below 2 it leaves cores
 *  idle, above 4 hits diminishing returns. Balance worker count × per-worker
 *  threads to keep both above-floor while saturating the CPU.
 *
 *  Examples:
 *    8 cores  → 2 workers × 4 threads = 8 (saturates)
 *    12 cores → 3 workers × 4 threads = 12
 *    16 cores → 4 workers × 4 threads = 16
 *    4 cores  → 2 workers × 2 threads = 4
 *    24 cores → 6 workers × 4 threads = 24 (worker cap kicks in)
 *
 *  The previous logic emitted 6 workers × 1 thread on an 8-core box, which
 *  is the worst of both worlds: many parallel ffmpeg pipe-reads serialised
 *  on a single-threaded whisper each. */
function balanceParallelism(cores, chunkCount) {
  const targetThreadsPerWorker = 4
  const idealWorkers = Math.max(1, Math.floor(cores / targetThreadsPerWorker))
  const workers = Math.max(1, Math.min(idealWorkers, 6, chunkCount || idealWorkers))
  const threadsPerWorker = Math.max(2, Math.floor(cores / workers))
  return { workers, threadsPerWorker }
}

/** Pick the whisper binary to run. On Windows/Linux the installer may ship a
 *  second, Vulkan-enabled build (`main-vulkan`): probe it once per app run by
 *  executing `-h`, if the Vulkan loader (vulkan-1.dll / libvulkan.so.1) is
 *  missing the process fails to even start and we silently fall back to the
 *  portable CPU binary. `gpu` reports whether the chosen binary can use a GPU
 *  (Metal build on macOS, working Vulkan elsewhere) so callers can enable
 *  GPU-only flags like flash attention. */
let cachedWhisperChoice = null
function pickWhisperBinary(p) {
  if (cachedWhisperChoice) return cachedWhisperChoice
  let bin = p.whisperBin
  let gpu = process.platform === 'darwin'   // Metal is compiled in on mac
  if (process.platform !== 'darwin' && fs.existsSync(p.whisperBinVulkan)) {
    const probe = spawnSync(p.whisperBinVulkan, ['-h'], { stdio: 'ignore', timeout: 15000 })
    if (!probe.error && probe.status === 0) {
      bin = p.whisperBinVulkan
      gpu = true
    }
  }
  cachedWhisperChoice = { bin, gpu }
  return cachedWhisperChoice
}

/** Make sure the ggml model for the chosen mode is on disk, downloading it
 *  (with progress events) the first time the user picks a non-default mode. */
async function ensureModel(p, modeKey, send) {
  const mode = MODEL_MODES[modeKey]
  const dest = path.join(p.modelsDir, mode.file)
  if (fs.existsSync(dest) && fs.statSync(dest).size >= mode.minBytes) return dest

  send({ phase: 'preparing', message: `Baixando o modelo ${mode.label} (${mode.sizeLabel}, uma vez só)…` })
  await runtimeSetup.downloadFile(MODEL_URL_BASE + mode.file, dest, 'model', (pr) => {
    const mb = (n) => (n / 1e6).toFixed(0)
    send({
      phase: 'preparing',
      message: pr.total
        ? `Modelo ${mode.label}: ${mb(pr.received)} / ${mb(pr.total)} MB`
        : `Modelo ${mode.label}: ${mb(pr.received)} MB`,
    })
  })
  if (fs.statSync(dest).size < mode.minBytes) {
    try { fs.unlinkSync(dest) } catch (_) {}
    throw new Error('Download do modelo incompleto. Verifique a conexão e tente novamente.')
  }
  return dest
}

// ── ffmpeg helpers ────────────────────────────────────────────────────────────

/** Convert any input into 16 kHz mono PCM WAV, the shape whisper + pyannote want. */
function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG_PATH, [
      '-y', '-i', inputPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      outputPath,
    ])
    let stderr = ''
    ff.stderr.on('data', d => { stderr += d.toString() })
    ff.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`ffmpeg exited ${code}\n${stderr.slice(-400)}`)))
    ff.on('error', reject)
  })
}

/** Run ffmpeg silencedetect over the WAV and return the audio duration plus
 *  the detected silence intervals. Silences are where chunk cuts should land:
 *  a fixed-60s cut regularly slices a word in half, which garbles or
 *  duplicates it in both chunks and breaks sentence context at every seam. */
function detectSilences(wavPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn(FFMPEG_PATH, [
      '-i', wavPath,
      '-af', 'silencedetect=noise=-35dB:d=0.4',
      '-f', 'null', '-',
    ])
    let stderr = ''
    ff.stderr.on('data', d => { stderr += d.toString() })
    ff.on('close', () => {
      // Duration: 00:42:13.98
      let duration = 0
      const dm = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/)
      if (dm) duration = (+dm[1]) * 3600 + (+dm[2]) * 60 + (+dm[3])

      const silences = []
      let start = null
      for (const line of stderr.split('\n')) {
        const s = line.match(/silence_start:\s*(-?\d+(?:\.\d+)?)/)
        const e = line.match(/silence_end:\s*(-?\d+(?:\.\d+)?)/)
        if (s) start = parseFloat(s[1])
        if (e && start !== null) {
          silences.push({ start, end: parseFloat(e[1]) })
          start = null
        }
      }
      resolve({ duration, silences })
    })
    ff.on('error', reject)
  })
}

/** Choose cut times ~chunkSeconds apart, sliding each one (within
 *  ±cutSearchWindow) to the middle of the nearest silence so no word is ever
 *  split across two chunks. Falls back to the exact target when no silence is
 *  nearby (continuous speech/music). */
function planCutTimes(duration, silences, chunkSeconds, window) {
  const cuts = []
  let last = 0
  while (last + chunkSeconds < duration - 5) {
    const target = last + chunkSeconds
    let best = null
    for (const s of silences) {
      const mid = (s.start + s.end) / 2
      if (mid <= last + 5 || mid < target - window || mid > target + window) continue
      if (best === null || Math.abs(mid - target) < Math.abs(best - target)) best = mid
    }
    const cut = best ?? target
    cuts.push(cut)
    last = cut
  }
  return cuts
}

/** Split the WAV at the given cut times via ffmpeg segment. We re-encode with
 *  pcm_s16le (NOT -c copy) because PCM has no keyframes and `-c copy` produces
 *  truncated chunks. Returns [{path, offset}] where offset is the chunk's real
 *  start time in seconds (cuts are no longer uniformly spaced). */
function splitWavAtCuts(wavPath, destDir, cutTimes) {
  return new Promise((resolve, reject) => {
    const collect = () => fs.readdirSync(destDir)
      .filter(f => f.startsWith('chunk_') && f.endsWith('.wav'))
      .sort()
      .map((f, i) => ({ path: path.join(destDir, f), offset: i === 0 ? 0 : cutTimes[i - 1] }))

    if (cutTimes.length === 0) {
      // Audio shorter than one chunk: single "chunk" is a copy of the WAV
      // (a copy so chunk cleanup can't delete the WAV pyannote is reading).
      const single = path.join(destDir, 'chunk_000.wav')
      try {
        fs.copyFileSync(wavPath, single)
        return resolve([{ path: single, offset: 0 }])
      } catch (err) { return reject(err) }
    }

    const pattern = path.join(destDir, 'chunk_%03d.wav')
    const ff = spawn(FFMPEG_PATH, [
      '-y', '-i', wavPath,
      '-f', 'segment',
      '-segment_times', cutTimes.map(t => t.toFixed(3)).join(','),
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      pattern,
    ])
    ff.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg segment exited ${code}`))
      resolve(collect())
    })
    ff.on('error', reject)
  })
}

// ── whisper.cpp ───────────────────────────────────────────────────────────────

/** Transcribe one WAV chunk. Returns segments [{start, end, text, words:[{start,end,text}]}]
 *  with timestamps shifted by `chunkOffsetSecs` so they're absolute against the
 *  full audio.
 *
 *  Key flags:
 *    --output-json-full   token-level timestamps so downstream can do word-level
 *                         speaker assignment (more accurate than segment-level
 *                         when whisper segments straddle a speaker change).
 *    --vad                Silero VAD skips silent regions before decode →
 *                         no "[Música]" / "Legenda por Sônia Ruberti" phantoms
 *                         hallucinated into silence.
 *    --suppress-nst       drops non-speech tokens whisper still tries to emit
 *                         even with VAD on.
 *    -dtw <preset>        DTW over cross-attention → much more accurate
 *                         token-level timestamps than the default heuristic;
 *                         feeds the per-word speaker assignment.
 *    -bs 5                beam search, explicit (better than greedy on
 *                         ambiguous audio; pin it so a CLI default change
 *                         upstream can't silently degrade quality).
 *    -fa                  flash attention, only when a GPU backend (Metal /
 *                         Vulkan) is actually in use. */
function transcribeChunk(whisper, modelPath, dtwPreset, wavPath, threads, chunkOffsetSecs) {
  return new Promise((resolve, reject) => {
    const outBase = wavPath.replace(/\.wav$/, '')
    const outJson = outBase + '.json'
    try { if (fs.existsSync(outJson)) fs.unlinkSync(outJson) } catch (_) {}

    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '-l', 'pt',
      '--output-json-full',
      '--output-file', outBase,
      '-t', String(threads),
      '--suppress-nst',
      '-bs', '5',
      // Cap how much past-segment context the decoder carries forward. With the
      // default (-1 = unlimited), whisper happily echoes earlier hallucinations
      // into subsequent segments → "repetition loops", invented phrases, and
      // lyrics-style poetry attached to silence. 64 tokens is enough for natural
      // long-range coherence (pronouns, topic continuity) without dragging a
      // bad earlier output into every following segment.
      '-mc', '64',
    ]
    if (dtwPreset) args.push('-dtw', dtwPreset)
    if (whisper.gpu) args.push('-fa')
    if (whisper.vadModel && fs.existsSync(whisper.vadModel)) {
      args.push('--vad', '--vad-model', whisper.vadModel)
    }

    let stderr = ''
    const proc = spawn(whisper.bin, args)
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch (_) {}
      reject(new Error(`whisper travou em ${path.basename(wavPath)} (>10 min), áudio corrompido?`))
    }, TIMEOUTS.perChunkMs)
    proc.stderr.on('data', d => { stderr += d.toString() })
    proc.on('close', code => {
      clearTimeout(killTimer)
      if (code !== 0) {
        return reject(new Error(`whisper failed (${code}): ${stderr.slice(-300)}`))
      }
      if (!fs.existsSync(outJson)) return reject(new Error('whisper produced no JSON'))
      try {
        const data = JSON.parse(fs.readFileSync(outJson, 'utf8'))
        const segs = (data.transcription || []).map(s => ({
          start: s.offsets.from / 1000 + chunkOffsetSecs,
          end:   s.offsets.to   / 1000 + chunkOffsetSecs,
          text:  (s.text || '').trim(),
          words: groupTokensIntoWords(s.tokens || [], s.offsets.from, s.offsets.to, chunkOffsetSecs),
        }))
        try { fs.unlinkSync(outJson) } catch (_) {}
        resolve(segs)
      } catch (err) {
        reject(new Error(`bad JSON from whisper: ${err.message}`))
      }
    })
    proc.on('error', err => { clearTimeout(killTimer); reject(err) })
  })
}

/** Whisper tokens → word-level timings.
 *  Tokens like " Olá" (leading space) start a new word; "ssem" attaches to
 *  the previous word. Punctuation tokens ("," ".") attach to the previous word.
 *  Control tokens that start with "[_" (e.g. "[_BEG_]") are dropped.
 *
 *  Timeline subtlety: whisper.cpp remaps SEGMENT offsets back to the original
 *  audio timeline when VAD trimmed silence, but token offsets and t_dtw stay
 *  in the VAD-filtered timeline. Using them raw skews every word by the total
 *  silence removed before it — which then assigns words to whoever spoke at
 *  the *shifted* time. Fix: linearly rescale the segment's token times onto
 *  the (already remapped) segment span. When VAD removed nothing the rescale
 *  is a near-identity map, so it's always safe to apply.
 *
 *  When DTW is enabled, each token carries t_dtw (centiseconds, -1 when
 *  unavailable): the attention-aligned moment the token is spoken, far more
 *  accurate than the length-heuristic offsets. Use consecutive t_dtw values
 *  as word boundaries, falling back to offsets for tokens without it. */
function groupTokensIntoWords(tokens, segFromMs, segToMs, chunkOffsetSecs) {
  // 1. Group tokens into words carrying raw (possibly VAD-timeline) times.
  const words = []
  let cur = null
  let prevDtwMs = null
  for (const t of tokens) {
    const text = t.text || ''
    if (!text || text.startsWith('[_')) continue
    const dtwMs = (typeof t.t_dtw === 'number' && t.t_dtw >= 0) ? t.t_dtw * 10 : null
    // Token span: prefer [previous t_dtw, own t_dtw], else heuristic offsets.
    const from = (dtwMs !== null && prevDtwMs !== null) ? prevDtwMs : (t.offsets?.from ?? 0)
    const to   = (dtwMs !== null) ? dtwMs : (t.offsets?.to ?? 0)
    if (dtwMs !== null) prevDtwMs = dtwMs

    const startsNewWord = /\s/.test(text[0] || '') || !cur
    if (startsNewWord) {
      if (cur) {
        const w = cur.text.trim()
        if (w) words.push({ start: cur.start, end: cur.end, text: w })
      }
      cur = { text, start: from, end: to }
    } else {
      cur.text += text
      cur.end = Math.max(cur.end, to)
    }
  }
  if (cur) {
    const w = cur.text.trim()
    if (w) words.push({ start: cur.start, end: cur.end, text: w })
  }
  if (words.length === 0) return words

  // 2. Rescale raw token times onto the VAD-remapped segment span.
  const rawMin = Math.min(...words.map(w => w.start))
  const rawMax = Math.max(...words.map(w => w.end))
  const rawSpan = rawMax - rawMin
  const segSpan = Math.max(0, segToMs - segFromMs)
  const scale = rawSpan > 0 ? segSpan / rawSpan : 0
  const remap = (ms) => segFromMs + (ms - rawMin) * scale

  // 3. Emit in absolute seconds, enforcing monotonic, non-degenerate spans.
  let lastEnd = -Infinity
  return words.map(w => {
    let start = remap(w.start) / 1000 + chunkOffsetSecs
    let end = remap(w.end) / 1000 + chunkOffsetSecs
    start = Math.max(start, lastEnd)
    end = Math.max(end, start + 0.02)
    lastEnd = end
    return { start, end, text: w.text }
  })
}

/** Run whisper on each chunk in parallel using the worker/thread balance
 *  computed by `balanceParallelism` upstream. Chunks carry their own real
 *  start offsets (silence-aligned cuts are not uniformly spaced).
 *  `abort.aborted` stops new chunks from being spawned (in-flight ones finish);
 *  used when the concurrent diarization fails and the run is doomed anyway. */
async function transcribeChunksParallel(whisper, modelPath, dtwPreset, chunks, workers, threadsPerWorker, onProgress, abort = { aborted: false }) {
  const results = new Array(chunks.length)
  let running = 0, index = 0

  await new Promise((resolve, reject) => {
    function pump() {
      while (!abort.aborted && running < workers && index < chunks.length) {
        const i = index++
        running++
        onProgress(`whisper: bloco ${i + 1}/${chunks.length}`)
        transcribeChunk(whisper, modelPath, dtwPreset, chunks[i].path, threadsPerWorker, chunks[i].offset)
          .then(segs => {
            results[i] = segs
            running--
            if (index < chunks.length) pump()
            else if (running === 0) resolve()
          })
          .catch(err => { running--; reject(err) })
      }
    }
    if (chunks.length === 0) resolve()
    else pump()
  })

  return results.flat()
}

// ── Window ────────────────────────────────────────────────────────────────────

// Persisted window bounds, restored across launches so the user's preferred
// size/position sticks (the "flexible on every platform" part: no max-width
// cap anymore — the renderer centers its reading column on wide windows).
function windowStateFile() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(windowStateFile(), 'utf8'))
    if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s
  } catch (_) {}
  return null
}

function createWindow() {
  // Default proportion (reading column) settled by the Swift port: 600×1040.
  // From there the user can resize freely; the renderer keeps text at a
  // readable measure by centering a max-width column.
  const saved = loadWindowState()
  const win = new BrowserWindow({
    width: saved?.width ?? 600,
    height: saved?.height ?? 1040,
    x: saved?.x,
    y: saved?.y,
    minWidth: 480,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#FFFFFF',
    show: false,                   // wait for first paint to avoid white flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  win.on('close', () => {
    try {
      if (!win.isMinimized() && !win.isFullScreen()) {
        fs.writeFileSync(windowStateFile(), JSON.stringify(win.getBounds()), 'utf8')
      }
    } catch (_) {}
  })

  if (isDev) win.loadURL('http://localhost:5173')
  else       win.loadFile(path.join(__dirname, '../renderer/dist/index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC: first-run setup ─────────────────────────────────────────────────────
// Boot calls `setup:check`; if not ready, kicks off `setup:run` and listens
// for `setup:progress` events. Subsequent boots short-circuit.

ipcMain.handle('setup:check', async () => runtimeSetup.checkSetup(app))

ipcMain.handle('setup:token-status', async () => ({ hasToken: !!runtimeSetup.readToken(app) }))

ipcMain.handle('setup:save-token', async (_e, token) => {
  try {
    runtimeSetup.saveToken(app, token)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
})

// Forget the saved token so the setup flow asks for a new one. A token can be
// present but unusable (revoked, wrong account, fine-grained without gated-repo
// scope), and without this every retry reuses it and fails identically.
ipcMain.handle('setup:clear-token', async () => {
  runtimeSetup.clearToken(app)
  return { ok: true }
})

ipcMain.handle('setup:run', async (event) => {
  const emit = (payload) => event.sender.send('setup:progress', payload)
  try {
    await runtimeSetup.runSetup(app, emit)
    return { ok: true }
  } catch (err) {
    emit({ phase: 'error', label: err.message || String(err), percent: 0 })
    return { ok: false, error: err.message || String(err) }
  }
})

// ── IPC: file dialogs ─────────────────────────────────────────────────────────

ipcMain.handle('dialog:open-audio', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Selecionar áudio ou vídeo',
    filters: [
      { name: 'Áudio', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'opus'] },
      { name: 'Vídeo', extensions: ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'] },
    ],
    properties: ['openFile'],
  })
  return canceled || filePaths.length === 0 ? null : filePaths[0]
})

ipcMain.handle('dialog:save-md', async (_e, baseName, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Salvar transcrição',
    defaultPath: `${baseName}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
})

ipcMain.handle('shell:open-external', async (_e, url) => {
  await shell.openExternal(url)
})

// ── IPC: full pipeline (chunked whisper ∥ pyannote) ───────────────────────────
//
// Flow:
//   ffmpeg → 16k mono WAV
//     ├─ pyannote.audio on the whole WAV (Python subprocess)  ┐ in parallel
//     └─ silence-aligned chunks → parallel whisper → segments ┘
//   → whisper JSON handed to the (already running) pyannote process
//   → per-word max-overlap assignment → final segments with speakers
//
// pyannote only needs the WAV, so it starts as soon as the conversion is done
// and runs while whisper transcribes: total wall time ≈ max(whisper, pyannote)
// instead of their sum.
//
// Frontend options:
//   expectedSpeakers  null → auto; 1 → skip diarization; >=2 → num_speakers=N
//                     (HARD constraint, soft hints like min_speakers let
//                     pyannote drift to N+1 phantoms in side-by-side tests)
//   mode              'fast' | 'balanced' | 'max' → whisper model choice
ipcMain.handle('transcribe:file', async (event, filePath, options) => {
  const send = (msg) => event.sender.send('transcribe:progress', msg)
  const p = runtimeSetup.paths(app)

  // Back-compat: the old renderer passed expectedSpeakers as a bare value.
  const opts = (options && typeof options === 'object') ? options : { expectedSpeakers: options }
  const expectedSpeakers = opts.expectedSpeakers ?? null
  const modeKey = MODEL_MODES[opts.mode] ? opts.mode : 'balanced'

  // Boot guarded by checkSetup, but a defensive re-check protects against the
  // user deleting userData manually between launch and a transcribe action.
  if (!fs.existsSync(p.whisperBin))    throw new Error('whisper_not_found')
  if (!fs.existsSync(p.venvPython))    throw new Error('diarization_not_configured')

  const hfToken = runtimeSetup.readToken(app)
  const whisperChoice = pickWhisperBinary(p)
  const whisper = { bin: whisperChoice.bin, gpu: whisperChoice.gpu, vadModel: p.vadModel }

  const ts = Date.now()
  const tmpDir = path.join(os.tmpdir(), `skkribe_${ts}`)
  const tmpWav = path.join(os.tmpdir(), `skkribe_${ts}.wav`)
  const segJson = path.join(os.tmpdir(), `skkribe_segs_${ts}.json`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const cleanup = () => {
    try { fs.unlinkSync(tmpWav) } catch (_) {}
    try { fs.unlinkSync(segJson) } catch (_) {}
    try { fs.unlinkSync(segJson + '.tmp') } catch (_) {}
    try {
      if (fs.existsSync(tmpDir)) {
        fs.readdirSync(tmpDir).forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)) } catch (_) {} })
        fs.rmdirSync(tmpDir)
      }
    } catch (_) {}
  }

  // Tracks which phase label diarization progress lines should carry: while
  // whisper is still running the UI stays on "transcribing" (phases render as
  // a linear stepper; bouncing back and forth would look broken).
  let whisperDone = false
  let diarProc = null

  try {
    // 1. Convert to canonical WAV + download the chosen model if needed
    //    (concurrent: the model download only competes with ffmpeg for I/O).
    send({ phase: 'preparing', message: 'Convertendo áudio para WAV 16kHz mono…' })
    const [modelPath] = await Promise.all([
      ensureModel(p, modeKey, send),
      convertToWav(filePath, tmpWav),
    ])

    // 2. Kick off pyannote on the full WAV NOW, in parallel with whisper.
    //    --wait-json makes it block (post-diarization) until we hand it the
    //    whisper segments via an atomic rename.
    let diarPromise = null
    if (expectedSpeakers !== 1) {
      const args = [p.diarizeScript, tmpWav, hfToken, segJson, '--wait-json']
      if (typeof expectedSpeakers === 'number' && expectedSpeakers >= 2) {
        args.push(`--num-speakers=${expectedSpeakers}`)
      }
      diarPromise = new Promise((resolve, reject) => {
        let stdout = '', stderr = ''
        // Point HF_HOME at the cache we populated during first-run setup, so
        // pyannote loads weights from disk instead of hitting the network.
        diarProc = spawn(p.venvPython, args, {
          env: { ...process.env, HF_HOME: p.hfCache },
        })
        const diarKill = setTimeout(() => {
          try { diarProc.kill('SIGKILL') } catch (_) {}
          reject(new Error('pyannote travou (>6h), provavelmente áudio muito longo ou corrompido'))
        }, TIMEOUTS.diarizeMs)
        diarProc.stdout.on('data', d => { stdout += d.toString() })
        diarProc.stderr.on('data', d => {
          stderr += d.toString()
          d.toString().split('\n').filter(l => l.trim()).forEach(l =>
            send({ phase: whisperDone ? 'diarizing' : 'transcribing', message: l }))
        })
        diarProc.on('close', () => {
          clearTimeout(diarKill)
          // diarize.py prints the result as a single JSON object on stdout, but
          // some pyannote/torch combos leak deprecation warnings or torchaudio
          // backend notices to stdout before that. Walk lines from the END
          // looking for the first one that parses as JSON and has either a
          // "segments" array or an "error" field, that's our payload.
          const lines = stdout.split('\n').map(l => l.trim()).filter(Boolean)
          let parsed = null
          for (let i = lines.length - 1; i >= 0; i--) {
            const l = lines[i]
            if (l[0] !== '{') continue
            try {
              const j = JSON.parse(l)
              if (j && (j.segments || j.error)) { parsed = j; break }
            } catch (_) { /* try previous line */ }
          }
          if (!parsed) {
            return reject(new Error(`pyannote retornou saída inesperada.\nstderr: ${stderr.slice(-400)}`))
          }
          if (parsed.error) return reject(new Error(parsed.error))
          resolve(parsed.segments)
        })
        diarProc.on('error', err => { clearTimeout(diarKill); reject(err) })
      })
      // A rejection before we `await` it (e.g. pyannote dies while whisper is
      // still running) must not become an unhandled rejection; the real await
      // below still receives the error.
      diarPromise.catch(() => {})
    }

    // 3. Silence-aligned chunking: cut near every ~60s mark but on a pause,
    //    never through the middle of a word.
    send({ phase: 'transcribing', message: 'Procurando pausas para dividir o áudio…' })
    const { duration, silences } = await detectSilences(tmpWav)
    const cuts = planCutTimes(duration, silences, PIPELINE.chunkSeconds, PIPELINE.cutSearchWindow)
    const chunks = await splitWavAtCuts(tmpWav, tmpDir, cuts)

    // 4. Parallel whisper (with VAD + non-speech-token suppression).
    //    With a GPU backend, cap the workers: each whisper process uploads its
    //    own copy of the model, and discrete cards with 4 GB would OOM at 4+.
    let { workers, threadsPerWorker } = balanceParallelism(os.cpus().length, chunks.length)
    if (whisper.gpu && whisper.bin === p.whisperBinVulkan) {
      workers = Math.min(workers, 2)
    }
    send({ phase: 'transcribing', message: `${chunks.length} blocos · ${workers}×${threadsPerWorker} threads${whisper.gpu ? ' · GPU' : ''}` })
    const abort = { aborted: false }
    const whisperWork = transcribeChunksParallel(
      whisper, modelPath, MODEL_MODES[modeKey].dtw, chunks, workers, threadsPerWorker,
      (msg) => send({ phase: 'transcribing', message: msg }),
      abort
    )
    // Surface an early diarization failure (bad token, model gating, broken
    // venv…) IMMEDIATELY instead of after the whole transcription: diarPromise
    // can't legitimately resolve before we hand it the whisper JSON, so any
    // early settle is a failure. The never-resolving wrapper keeps a (then
    // impossible) success from leaking into the race.
    const diarFailureGuard = diarPromise ? diarPromise.then(() => new Promise(() => {})) : null
    let whisperSegments
    try {
      whisperSegments = diarFailureGuard
        ? await Promise.race([whisperWork, diarFailureGuard])
        : await whisperWork
    } catch (err) {
      abort.aborted = true
      throw err
    }
    whisperDone = true

    // Drop the chunk files, keep the full WAV for pyannote.
    try {
      chunks.forEach(c => { try { fs.unlinkSync(c.path) } catch (_) {} })
      fs.rmdirSync(tmpDir)
    } catch (_) {}

    // Short-circuit single-speaker mode.
    if (expectedSpeakers === 1) {
      send({ phase: 'merging', message: 'Modo monólogo, sem diarização.' })
      const final = whisperSegments
        .filter(s => s.text)
        .map(s => ({ start: s.start, end: s.end, speaker: 'Pessoa 1', text: s.text }))
      cleanup()
      return { fileName: path.basename(filePath), segments: final }
    }

    // 5. Hand the whisper segments to the (already running) pyannote process.
    //    Atomic write: diarize.py treats file existence as "complete".
    send({ phase: 'diarizing', message: 'Combinando transcrição com as vozes…' })
    fs.writeFileSync(segJson + '.tmp', JSON.stringify({
      transcription: whisperSegments.map(s => ({
        offsets: { from: Math.round(s.start * 1000), to: Math.round(s.end * 1000) },
        text: s.text,
        words: (s.words || []).map(w => ({
          start: w.start, end: w.end, text: w.text,
        })),
      })),
    }), 'utf8')
    fs.renameSync(segJson + '.tmp', segJson)

    const segments = await diarPromise
    cleanup()
    return { fileName: path.basename(filePath), segments }
  } catch (err) {
    if (diarProc) { try { diarProc.kill('SIGKILL') } catch (_) {} }
    cleanup()
    throw err
  }
})
