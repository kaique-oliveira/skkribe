const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads')
const fs = require('fs')
const os = require('os')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ── Config de performance ──────────────────────────────────────────────────────
const PERF_CONFIG_PATH = path.join(
  isDev
    ? path.join(__dirname, '../../resources')
    : (app.isPackaged ? process.resourcesPath : path.join(__dirname, '../../resources')),
  'perf-config.json'
)

function loadPerfConfig() {
  const defaults = { model: 'small', threads: Math.min(os.cpus().length, 8), chunkSeconds: 60 }
  try {
    if (fs.existsSync(PERF_CONFIG_PATH)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(PERF_CONFIG_PATH, 'utf8')) }
    }
  } catch (_) {}
  return defaults
}

function savePerfConfig(cfg) {
  try { fs.writeFileSync(PERF_CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8') } catch (_) {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResourcesBase() {
  return app.isPackaged
    ? process.resourcesPath
    : path.join(__dirname, '../../resources')
}

/** Converte qualquer áudio → WAV 16kHz mono */
function convertToWav(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-y', '-i', inputPath,
      '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
      outputPath,
    ])
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg saiu com código ${code}`)))
    ff.on('error', reject)
  })
}

/** Divide WAV em chunks de N segundos usando ffmpeg segment */
function splitWavIntoChunks(wavPath, destDir, chunkSeconds) {
  return new Promise((resolve, reject) => {
    const pattern = path.join(destDir, 'chunk_%03d.wav')
    // IMPORTANTE: não usar "-c copy" para WAV PCM — ele não tem keyframes e o segmento
    // fica truncado/corrompido no início. Re-encodar com pcm_s16le garante cada chunk válido.
    const ff = spawn('ffmpeg', [
      '-y', '-i', wavPath,
      '-f', 'segment',
      '-segment_time', String(chunkSeconds),
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      pattern,
    ])
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg segment saiu com código ${code}`))
      const chunks = fs.readdirSync(destDir)
        .filter(f => f.startsWith('chunk_') && f.endsWith('.wav'))
        .sort()
        .map(f => path.join(destDir, f))
      resolve(chunks)
    })
    ff.on('error', reject)
  })
}

/** Transcreve um único chunk WAV com whisper, retorna array de segmentos */
function transcribeChunk(whisperBin, modelPath, wavPath, threads, chunkIndex, chunkOffsetSecs, sendProgress) {
  return new Promise((resolve, reject) => {
    // outBase é o caminho sem extensão — o whisper adiciona .json automaticamente
    const outBase = wavPath.replace(/\.wav$/, '')
    const outJson = outBase + '.json'

    // Remove JSON anterior se existir (evita ler resultado stale em caso de retry)
    try { if (fs.existsSync(outJson)) fs.unlinkSync(outJson) } catch (_) {}

    let stderrBuf = ''
    const args = [
      '-m', modelPath,
      '-f', wavPath,
      '-l', 'pt',
      '--output-json',
      '--output-file', outBase,
      '-t', String(threads),
    ]

    const proc = spawn(whisperBin, args)
    proc.stderr.on('data', (d) => {
      stderrBuf += d.toString()
      if (sendProgress) sendProgress(d.toString())
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          `whisper chunk ${chunkIndex + 1} falhou (código ${code}).\n` +
          `Arquivo: ${path.basename(wavPath)}\n` +
          `stderr: ${stderrBuf.slice(-300)}`
        ))
      }
      if (!fs.existsSync(outJson)) {
        return reject(new Error(`whisper não gerou JSON para o chunk ${chunkIndex + 1}`))
      }
      try {
        const data = JSON.parse(fs.readFileSync(outJson, 'utf8'))
        const segs = (data.transcription || []).map(s => ({
          start: s.offsets.from / 1000 + chunkOffsetSecs,
          end:   s.offsets.to   / 1000 + chunkOffsetSecs,
          text:  s.text.trim(),
        }))
        try { fs.unlinkSync(outJson) } catch (_) {}
        resolve(segs)
      } catch (err) {
        reject(new Error(`Erro ao parsear JSON do chunk ${chunkIndex + 1}: ${err.message}`))
      }
    })
    proc.on('error', reject)
  })
}

/** Processa lista de chunks em paralelo (máximo maxWorkers simultâneos) */
async function transcribeChunksParallel(whisperBin, modelPath, chunks, threads, chunkSeconds, maxWorkers, sendProgress) {
  const results = new Array(chunks.length)
  let running = 0
  let index = 0

  await new Promise((resolve, reject) => {
    function next() {
      while (running < maxWorkers && index < chunks.length) {
        const i = index++
        running++
        const chunkPath = chunks[i]
        const workerThreads = Math.max(1, Math.floor(threads / Math.min(maxWorkers, chunks.length)))
        const chunkOffsetSecs = i * chunkSeconds   // offset real deste chunk no áudio original
        sendProgress(`whisper: processando bloco ${i + 1}/${chunks.length}...\n`)
        transcribeChunk(whisperBin, modelPath, chunkPath, workerThreads, i, chunkOffsetSecs, null)
          .then((segs) => {
            results[i] = segs
            running--
            if (index < chunks.length) next()
            else if (running === 0) resolve()
          })
          .catch((err) => {
            running--
            reject(err)
          })
      }
    }
    next()
    if (chunks.length === 0) resolve()
  })

  // Achata tudo em ordem
  return results.flat()
}

// ── App Window ────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../../src/renderer/dist/index.html'))
  }
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

// ─── IPC: abrir diálogo de arquivo ───────────────────────────────────────────
ipcMain.handle('open-file-dialog', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Selecionar áudio',
    filters: [
      { name: 'Áudio', extensions: ['mp3', 'm4a', 'wav', 'ogg', 'flac', 'aac', 'mp4'] },
    ],
    properties: ['openFile'],
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
})

// ─── IPC: salvar arquivo Markdown ─────────────────────────────────────────────
ipcMain.handle('save-md-file', async (event, baseName, content) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Salvar transcrição',
    defaultPath: `${baseName}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  })
  if (canceled || !filePath) return null
  fs.writeFileSync(filePath, content, 'utf8')
  return filePath
})

// ─── IPC: verifica se diarização está configurada ─────────────────────────────
ipcMain.handle('check-diarization', async () => {
  const resourcesBase = getResourcesBase()
  const configPath = path.join(resourcesBase, 'python/.diarization-config.json')
  if (!fs.existsSync(configPath)) return { ready: false }
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return { ready: true, pythonBin: config.pythonBin }
  } catch (_) {
    return { ready: false }
  }
})

// ─── IPC: config de performance ───────────────────────────────────────────────
ipcMain.handle('get-perf-config', async () => {
  const cfg = loadPerfConfig()
  const resourcesBase = getResourcesBase()
  const modelsDir = path.join(resourcesBase, 'whisper/models')
  const availableModels = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo']
    .filter(m => ['', '-q5_1', '-q5_0', '-q8_0', '-q4_0'].some(
      suf => fs.existsSync(path.join(modelsDir, `ggml-${m}${suf}.bin`))
    ))
  const cpuCount = os.cpus().length
  return { ...cfg, availableModels, cpuCount }
})

ipcMain.handle('save-perf-config', async (event, cfg) => {
  savePerfConfig(cfg)
  return true
})

// ─── IPC: transcrever com pipeline otimizado ──────────────────────────────────
// Fluxo: ffmpeg → chunks → whisper paralelo → pyannote (WAV completo) → resultado diarizado
// A diarização é SEMPRE executada — é o produto central do Skribe.
// Se não estiver configurada, lança erro 'diarization_not_configured'.
ipcMain.handle('transcribe-file', async (event, filePath) => {
  const resourcesBase = getResourcesBase()
  const whisperBin    = path.join(resourcesBase, 'whisper/main')
  const modelsDir     = path.join(resourcesBase, 'whisper/models')
  const configPath    = path.join(resourcesBase, 'python/.diarization-config.json')
  const diarizeScript = path.join(resourcesBase, 'python/diarize.py')

  if (!fs.existsSync(whisperBin))  throw new Error('whisper_not_found')
  if (!fs.existsSync(configPath))  throw new Error('diarization_not_configured')

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const { pythonBin, hfToken } = config

  // ── Config de performance ──────────────────────────────────────────────────
  const perfCfg    = loadPerfConfig()
  const modelName  = perfCfg.model || 'small'
  const threads    = perfCfg.threads || Math.min(os.cpus().length, 8)
  const chunkSecs  = perfCfg.chunkSeconds || 60
  const maxWorkers = Math.max(1, Math.min(Math.floor(os.cpus().length / 2), 6))

  // Encontra modelo — prefere quantizado, ignora arquivos menores que 10 MB
  const MIN_MODEL_SIZE = 10 * 1024 * 1024
  const modelPath = [
    `ggml-${modelName}-q5_1.bin`,
    `ggml-${modelName}-q5_0.bin`,
    `ggml-${modelName}-q8_0.bin`,
    `ggml-${modelName}.bin`,
  ]
    .map(f => path.join(modelsDir, f))
    .find(p => fs.existsSync(p) && fs.statSync(p).size >= MIN_MODEL_SIZE)

  if (!modelPath) throw new Error('model_not_found')

  const ts     = Date.now()
  const tmpDir = path.join(os.tmpdir(), `skribe_${ts}`)
  const tmpWav = path.join(os.tmpdir(), `skribe_${ts}.wav`)  // WAV completo — necessário para o pyannote
  fs.mkdirSync(tmpDir, { recursive: true })

  const send = (msg) => event.sender.send('transcription-progress', msg)

  function cleanup() {
    try { fs.unlinkSync(tmpWav) } catch (_) {}
    try {
      if (fs.existsSync(tmpDir))
        fs.readdirSync(tmpDir).forEach(f => { try { fs.unlinkSync(path.join(tmpDir, f)) } catch (_) {} })
      fs.rmdirSync(tmpDir)
    } catch (_) {}
  }

  try {
    // ── 1. Converter para WAV 16kHz mono ──────────────────────────────────────
    send('convert: preparando o áudio...\n')
    await convertToWav(filePath, tmpWav)

    // ── 2. Dividir em chunks para whisper paralelo ─────────────────────────────
    send(`whisper: dividindo em blocos de ${chunkSecs}s...\n`)
    const chunks = await splitWavIntoChunks(tmpWav, tmpDir, chunkSecs)
    send(`whisper: ${chunks.length} blocos — processando com ${maxWorkers} workers em paralelo...\n`)

    // ── 3. Transcrever chunks em paralelo ──────────────────────────────────────
    const whisperSegments = await transcribeChunksParallel(
      whisperBin, modelPath, chunks, threads, chunkSecs, maxWorkers, send
    )
    // whisperSegments: [{ start, end, text }] com timestamps absolutos do áudio original

    // Limpa apenas os chunks — o tmpWav ainda é necessário para o pyannote
    try {
      chunks.forEach(c => { try { fs.unlinkSync(c) } catch (_) {} })
      fs.rmdirSync(tmpDir)
    } catch (_) {}

    // ── 4. Converte segmentos para o formato que o diarize.py espera ───────────
    // diarize.py lê: { transcription: [{ offsets: { from: ms, to: ms }, text }] }
    const tmpSegJson = path.join(os.tmpdir(), `skribe_segs_${ts}.json`)
    const whisperJson = {
      transcription: whisperSegments.map(s => ({
        offsets: { from: Math.round(s.start * 1000), to: Math.round(s.end * 1000) },
        text: s.text,
      }))
    }
    fs.writeFileSync(tmpSegJson, JSON.stringify(whisperJson), 'utf8')

    // ── 5. Diarização: pyannote usa o WAV completo + segmentos do whisper ──────
    send('pyannote: analisando as vozes...\n')

    return new Promise((resolve, reject) => {
      let stdout = ''
      let stderr = ''

      // Argumentos: audio.wav  hf_token  whisper_segments.json
      const proc = spawn(pythonBin, [diarizeScript, tmpWav, hfToken, tmpSegJson])

      proc.stdout.on('data', (d) => { stdout += d.toString() })
      proc.stderr.on('data', (d) => {
        const chunk = d.toString()
        stderr += chunk
        chunk.split('\n').filter(l => l.trim()).forEach(l => send(l + '\n'))
      })

      proc.on('close', () => {
        try { fs.unlinkSync(tmpWav) } catch (_) {}
        try { fs.unlinkSync(tmpSegJson) } catch (_) {}

        // O diarize.py imprime apenas uma linha JSON no stdout (a última)
        const lastLine = stdout.trim().split('\n').filter(l => l.trim()).pop() || ''
        try {
          const parsed = JSON.parse(lastLine)
          if (parsed.error) return reject(new Error(parsed.error))
          resolve({
            fileName: path.basename(filePath),
            segments: parsed.segments,
          })
        } catch (_) {
          reject(new Error(`Saída inesperada do Python.\nstdout: ${stdout.slice(0, 400)}\nstderr: ${stderr.slice(-400)}`))
        }
      })

      proc.on('error', (err) => {
        try { fs.unlinkSync(tmpWav) } catch (_) {}
        try { fs.unlinkSync(tmpSegJson) } catch (_) {}
        reject(err)
      })
    })

  } catch (err) {
    cleanup()
    throw err
  }
})
