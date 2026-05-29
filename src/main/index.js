// Skkribe — Electron main process.
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
const { spawn } = require('child_process')
const runtimeSetup = require('./runtime-setup')

// Bundled static ffmpeg binary. When the .app is launched from Finder it
// inherits a minimal PATH that doesn't include /opt/homebrew/bin, so a bare
// `ffmpeg` spawn ENOENTs. ffmpeg-static ships the binary in node_modules and
// returns its absolute path — works in both dev and packaged mode.
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

// Pipeline constants. Quality-over-speed defaults baked in — the user no longer
// chooses the model. `large-v3` is the best whisper variant for proper nouns
// and rare words; if it's not on disk the transcribe handler falls back to
// whatever IS downloaded (turbo, medium, small) via the size-sorted lookup.
const PIPELINE = Object.freeze({
  model: 'large-v3',
  threads: Math.min(os.cpus().length, 8),
  chunkSeconds: 60,
})

// Per-subprocess timeouts. Whisper.cpp on CPU runs about real-time per chunk,
// so 10 min per 60s chunk is ~10× slowdown headroom — anything beyond that is
// a genuine hang (corrupted audio, OS locking, etc). Pyannote on CPU is
// ~1× realtime; for a 4-hour audio cap it at 6 hours.
const TIMEOUTS = Object.freeze({
  perChunkMs:  10 * 60 * 1000,        // whisper per chunk
  diarizeMs:   6 * 60 * 60 * 1000,    // pyannote on the full WAV
})

/** Whisper benefits from 2–4 threads per process; below 2 it leaves cores
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

// ── ffmpeg helpers ────────────────────────────────────────────────────────────

/** Convert any input into 16 kHz mono PCM WAV — the shape whisper + pyannote want. */
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

/** Split a WAV file into chunkSeconds-long pieces via ffmpeg segment. We re-encode
 *  with pcm_s16le (NOT -c copy) because PCM has no keyframes and `-c copy` produces
 *  truncated chunks. */
function splitWavIntoChunks(wavPath, destDir, chunkSeconds) {
  return new Promise((resolve, reject) => {
    const pattern = path.join(destDir, 'chunk_%03d.wav')
    const ff = spawn(FFMPEG_PATH, [
      '-y', '-i', wavPath,
      '-f', 'segment',
      '-segment_time', String(chunkSeconds),
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      pattern,
    ])
    ff.on('close', code => {
      if (code !== 0) return reject(new Error(`ffmpeg segment exited ${code}`))
      const chunks = fs.readdirSync(destDir)
        .filter(f => f.startsWith('chunk_') && f.endsWith('.wav'))
        .sort()
        .map(f => path.join(destDir, f))
      resolve(chunks)
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
 *                         even with VAD on. */
function transcribeChunk(whisperBin, vadModel, modelPath, wavPath, threads, chunkOffsetSecs) {
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
      // Cap how much past-segment context the decoder carries forward. With the
      // default (-1 = unlimited), whisper happily echoes earlier hallucinations
      // into subsequent segments → "repetition loops", invented phrases, and
      // lyrics-style poetry attached to silence. 64 tokens is enough for natural
      // long-range coherence (pronouns, topic continuity) without dragging a
      // bad earlier output into every following segment.
      '-mc', '64',
    ]
    if (vadModel && fs.existsSync(vadModel)) {
      args.push('--vad', '--vad-model', vadModel)
    }

    let stderr = ''
    const proc = spawn(whisperBin, args)
    const killTimer = setTimeout(() => {
      try { proc.kill('SIGKILL') } catch (_) {}
      reject(new Error(`whisper travou em ${path.basename(wavPath)} (>10 min) — áudio corrompido?`))
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
          // Group whisper tokens into words: a token starting with whitespace
          // opens a new word; tokens without leading space are continuations
          // (subwords or attached punctuation). Skips control tokens like [_BEG_].
          words: groupTokensIntoWords(s.tokens || [], chunkOffsetSecs),
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
 *  Control tokens that start with "[_" (e.g. "[_BEG_]") are dropped. */
function groupTokensIntoWords(tokens, chunkOffsetSecs) {
  const out = []
  let cur = null
  for (const t of tokens) {
    const text = t.text || ''
    if (!text || text.startsWith('[_')) continue
    const from = (t.offsets?.from ?? 0) / 1000 + chunkOffsetSecs
    const to   = (t.offsets?.to ?? 0)   / 1000 + chunkOffsetSecs
    const startsNewWord = /\s/.test(text[0] || '') || !cur
    if (startsNewWord) {
      if (cur) {
        const w = cur.text.trim()
        if (w) out.push({ start: cur.start, end: cur.end, text: w })
      }
      cur = { text, start: from, end: to }
    } else {
      cur.text += text
      cur.end = to
    }
  }
  if (cur) {
    const w = cur.text.trim()
    if (w) out.push({ start: cur.start, end: cur.end, text: w })
  }
  return out
}

/** Run whisper on each chunk in parallel using the worker/thread balance
 *  computed by `balanceParallelism` upstream. */
async function transcribeChunksParallel(whisperBin, vadModel, modelPath, chunks, workers, threadsPerWorker, chunkSeconds, onProgress) {
  const results = new Array(chunks.length)
  let running = 0, index = 0

  await new Promise((resolve, reject) => {
    function pump() {
      while (running < workers && index < chunks.length) {
        const i = index++
        running++
        const offset = i * chunkSeconds
        onProgress(`whisper: bloco ${i + 1}/${chunks.length}`)
        transcribeChunk(whisperBin, vadModel, modelPath, chunks[i], threadsPerWorker, offset)
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

function createWindow() {
  // Reading-column layout. The Swift port settled on this proportion after
  // testing: too wide and the transcript becomes hard to read (long line
  // lengths kill scan-ability); too narrow and the speaker pills + meta strip
  // overflow. 600 wide / 1040 tall hits both targets and leaves room for the
  // bottom-right FAB without crowding any view.
  const win = new BrowserWindow({
    width: 600,
    height: 1040,
    minWidth: 500,
    maxWidth: 820,
    minHeight: 640,
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

// ── IPC: full pipeline (chunked whisper + pyannote) ───────────────────────────
//
// Flow:
//   ffmpeg → 16k mono WAV → split into chunks → parallel whisper → segments
//   → pyannote.audio (Python subprocess, on whole WAV) → diar segments
//   → max-overlap assignment → final segments with speakers
//
// Frontend hint `expectedSpeakers` is forwarded to diarize.py as a kwarg:
//   null     → auto (pyannote picks)
//   1        → skip diarization, attribute everything to one speaker
//   >=2      → num_speakers=N (HARD constraint — soft hints like min_speakers
//              let pyannote drift to N+1 phantoms in side-by-side tests)
ipcMain.handle('transcribe:file', async (event, filePath, expectedSpeakers) => {
  const send = (msg) => event.sender.send('transcribe:progress', msg)
  const p = runtimeSetup.paths(app)

  // Boot guarded by checkSetup, but a defensive re-check protects against the
  // user deleting userData manually between launch and a transcribe action.
  if (!fs.existsSync(p.whisperBin))    throw new Error('whisper_not_found')
  if (!fs.existsSync(p.whisperModel))  throw new Error('model_not_found')
  if (!fs.existsSync(p.venvPython))    throw new Error('diarization_not_configured')

  const whisperBin = p.whisperBin
  const vadModel = p.vadModel
  const diarizeScript = p.diarizeScript
  const pythonBin = p.venvPython
  const hfToken = runtimeSetup.HF_TOKEN
  const modelPath = p.whisperModel

  const { chunkSeconds: chunkSecs } = PIPELINE
  const { workers, threadsPerWorker } = balanceParallelism(os.cpus().length)

  const ts = Date.now()
  const tmpDir = path.join(os.tmpdir(), `skkribe_${ts}`)
  const tmpWav = path.join(os.tmpdir(), `skkribe_${ts}.wav`)
  fs.mkdirSync(tmpDir, { recursive: true })

  const cleanup = () => {
    try { fs.unlinkSync(tmpWav) } catch (_) {}
    try {
      if (fs.existsSync(tmpDir)) {
        fs.readdirSync(tmpDir).forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)) } catch (_) {} })
        fs.rmdirSync(tmpDir)
      }
    } catch (_) {}
  }

  try {
    // 1. Convert to canonical WAV
    send({ phase: 'preparing', message: 'Convertendo áudio para WAV 16kHz mono…' })
    await convertToWav(filePath, tmpWav)

    // 2. Split into chunks
    send({ phase: 'transcribing', message: `Dividindo em blocos de ${chunkSecs}s…` })
    const chunks = await splitWavIntoChunks(tmpWav, tmpDir, chunkSecs)

    // 3. Parallel whisper (with VAD + non-speech-token suppression)
    send({ phase: 'transcribing', message: `${chunks.length} blocos · ${workers}×${threadsPerWorker} threads em paralelo` })
    const whisperSegments = await transcribeChunksParallel(
      whisperBin, vadModel, modelPath, chunks, workers, threadsPerWorker, chunkSecs,
      (msg) => send({ phase: 'transcribing', message: msg })
    )

    // Drop the chunk files — keep the full WAV for pyannote.
    try {
      chunks.forEach(c => { try { fs.unlinkSync(c) } catch (_) {} })
      fs.rmdirSync(tmpDir)
    } catch (_) {}

    // Short-circuit single-speaker mode.
    if (expectedSpeakers === 1) {
      send({ phase: 'merging', message: 'Modo monólogo — sem diarização.' })
      const final = whisperSegments
        .filter(s => s.text)
        .map(s => ({ start: s.start, end: s.end, speaker: 'Pessoa 1', text: s.text }))
      try { fs.unlinkSync(tmpWav) } catch (_) {}
      return { fileName: path.basename(filePath), segments: final }
    }

    // 4. Run pyannote on full WAV with whisper segments + words as input.
    //    Word-level data unlocks per-word speaker assignment with hysteresis
    //    inside diarize.py — much more accurate than the old segment-level
    //    matching when whisper segments straddle real speaker changes.
    send({ phase: 'diarizing', message: 'pyannote: identificando vozes…' })
    const segJson = path.join(os.tmpdir(), `skkribe_segs_${ts}.json`)
    fs.writeFileSync(segJson, JSON.stringify({
      transcription: whisperSegments.map(s => ({
        offsets: { from: Math.round(s.start * 1000), to: Math.round(s.end * 1000) },
        text: s.text,
        words: (s.words || []).map(w => ({
          start: w.start, end: w.end, text: w.text,
        })),
      })),
    }), 'utf8')

    const result = await new Promise((resolve, reject) => {
      let stdout = '', stderr = ''
      const args = [diarizeScript, tmpWav, hfToken, segJson]
      if (typeof expectedSpeakers === 'number' && expectedSpeakers >= 2) {
        // Hard constraint in all cases where the user gave a count. Using
        // `--min-speakers=N` (the previous behavior for 3+) let pyannote drift
        // up to N+1 phantoms; `--num-speakers=N` forces exactly N clusters and
        // produced consistently better results in side-by-side tests. Users
        // who genuinely don't know the count select "Não sei" instead.
        args.push(`--num-speakers=${expectedSpeakers}`)
      }
      // Point HF_HOME at the cache we populated during first-run setup, so
      // pyannote loads weights from disk instead of hitting the network.
      const proc = spawn(pythonBin, args, {
        env: { ...process.env, HF_HOME: p.hfCache },
      })
      const diarKill = setTimeout(() => {
        try { proc.kill('SIGKILL') } catch (_) {}
        reject(new Error('pyannote travou (>6h) — provavelmente áudio muito longo ou corrompido'))
      }, TIMEOUTS.diarizeMs)
      proc.stdout.on('data', d => { stdout += d.toString() })
      proc.stderr.on('data', d => {
        stderr += d.toString()
        d.toString().split('\n').filter(l => l.trim()).forEach(l => send({ phase: 'diarizing', message: l }))
      })
      proc.on('close', () => {
        clearTimeout(diarKill)
        try { fs.unlinkSync(tmpWav) } catch (_) {}
        try { fs.unlinkSync(segJson) } catch (_) {}
        // diarize.py prints the result as a single JSON object on stdout, but
        // some pyannote/torch combos leak deprecation warnings or torchaudio
        // backend notices to stdout before that. Walk lines from the END
        // looking for the first one that parses as JSON and has either a
        // "segments" array or an "error" field — that's our payload.
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
        resolve({ fileName: path.basename(filePath), segments: parsed.segments })
      })
      proc.on('error', err => { clearTimeout(diarKill); reject(err) })
    })

    return result
  } catch (err) {
    cleanup()
    throw err
  }
})
