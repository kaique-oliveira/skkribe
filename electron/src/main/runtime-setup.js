// First-run auto-setup. Downloads the whisper model + bootstraps the pyannote
// Python venv the first time the packaged app is launched.
//
// Path strategy:
//
//   bundledBase()  — read-only, shipped inside the .app/.exe/.AppImage.
//                    CI populates this via extraResources:
//                      • whisper/main(.exe)               ← built from source
//                      • whisper/ggml-silero-v5.1.2.bin    ← VAD model (~864 KB)
//                      • python/diarize.py                ← committed in repo
//                      • python/runtime/ (Windows only)   ← python-build-standalone
//
//   userBase()     — writable, lives in app.getPath('userData'). The runtime
//                    setup writes here so the installed app stays signable +
//                    untouched:
//                      • models/ggml-large-v3-q5_0.bin    ~1.08 GB
//                      • python-venv/                     created at first run
//                      • hf-cache/                        pyannote weights
//
// In dev (`npm run dev`), both base paths collapse to the repo's
// `electron/resources/` directory so manual setup-* scripts still work.

const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const { spawn, spawnSync } = require('child_process')

// Embedded HuggingFace token for the gated pyannote repos. Only used by the
// first-run setup to download model weights — runtime diarization reads the
// cached weights and doesn't re-auth. The token is visible to anyone who
// extracts the installer; it's a personal read-only token and can be
// regenerated if abuse is detected.
const HF_TOKEN = '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'

const WHISPER_MODEL_FILE = 'ggml-large-v3-q5_0.bin'
const WHISPER_MODEL_URL  = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${WHISPER_MODEL_FILE}`
// large-v3 q5_0 is ~1.08 GB on disk. Set the sanity floor below that so a
// completed download passes, but above any obviously-truncated partial.
const MIN_MODEL_BYTES    = 900 * 1024 * 1024   // ~900 MB

const WHISPER_BIN_NAME = process.platform === 'win32' ? 'main.exe' : 'main'

// ── Path resolution ──────────────────────────────────────────────────────────

function bundledBase(app) {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(__dirname, '../../resources')
}

function userBase(app) {
  if (!app.isPackaged) return path.join(__dirname, '../../resources')
  return app.getPath('userData')
}

function paths(app) {
  const bundled = bundledBase(app)
  const user = userBase(app)
  const binDir = process.platform === 'win32' ? 'Scripts' : 'bin'
  return {
    // bundled (read-only, lives inside the .app/.exe/.AppImage)
    whisperBin:     path.join(bundled, 'whisper', WHISPER_BIN_NAME),
    vadModel:       path.join(bundled, 'whisper', 'ggml-silero-v5.1.2.bin'),
    diarizeScript:  path.join(bundled, 'python', 'diarize.py'),
    winPythonBin:   path.join(bundled, 'python', 'runtime', 'python.exe'),
    // user-writable (userData in prod, repo's resources/ in dev so manual
    // setup scripts and the runtime auto-setup share the same paths)
    modelsDir:      path.join(user, 'whisper', 'models'),
    whisperModel:   path.join(user, 'whisper', 'models', WHISPER_MODEL_FILE),
    venvDir:        path.join(user, 'python', 'venv'),
    venvPython:     path.join(user, 'python', 'venv', binDir,
                              process.platform === 'win32' ? 'python.exe' : 'python'),
    venvPip:        path.join(user, 'python', 'venv', binDir,
                              process.platform === 'win32' ? 'pip.exe' : 'pip'),
    hfCache:        path.join(user, 'python', 'hf_cache'),
    setupMarker:    path.join(user, 'python', 'hf_cache', '.complete'),
  }
}

function findSystemPython(app) {
  if (process.platform === 'win32') {
    const p = paths(app).winPythonBin
    return fs.existsSync(p) ? p : null
  }
  for (const bin of ['python3', 'python3.11', 'python3.12', 'python3.10', 'python']) {
    const r = spawnSync(bin, ['--version'], { stdio: 'pipe' })
    if (r.status === 0) return bin
  }
  return null
}

// Schema version of the python venv layout. Bump when changing the pinned
// pyannote.audio version or the HF API kwargs — a mismatch triggers a venv
// rebuild instead of leaving the user with an obscure Python TypeError.
const VENV_SCHEMA = '2'

// ── Granular readiness check ─────────────────────────────────────────────────
function checkSetup(app) {
  const p = paths(app)
  const hasModel = fs.existsSync(p.modelsDir) && fs.readdirSync(p.modelsDir).some(
    f => f.startsWith('ggml-large-v3') && fs.statSync(path.join(p.modelsDir, f)).size >= MIN_MODEL_BYTES
  )
  const schemaFile = path.join(p.venvDir, '.skribe-venv-schema')
  const venvOk = fs.existsSync(p.venvPython)
              && fs.existsSync(schemaFile)
              && fs.readFileSync(schemaFile, 'utf8').trim() === VENV_SCHEMA
  const checks = {
    whisperBin:      fs.existsSync(p.whisperBin),
    vadModel:        fs.existsSync(p.vadModel),
    diarizeScript:   fs.existsSync(p.diarizeScript),
    whisperModel:    hasModel,
    pyannoteVenv:    venvOk,
    pyannoteWeights: fs.existsSync(p.setupMarker) && venvOk,
  }
  return { ready: Object.values(checks).every(Boolean), checks, paths: p }
}

// ── HTTP download with progress + atomic rename ──────────────────────────────
function downloadFile(url, dest, label, onProgress) {
  const tmp = dest + '.part'
  fs.mkdirSync(path.dirname(dest), { recursive: true })

  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(tmp)
    let received = 0, total = 0, lastEmit = 0

    function follow(currentUrl, hops = 0) {
      if (hops > 5) return reject(new Error(`muitos redirects em ${currentUrl}`))
      const req = https.get(currentUrl, { headers: { 'user-agent': 'skribe-electron' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return follow(new URL(res.headers.location, currentUrl).toString(), hops + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} em ${currentUrl}`))
        }
        total = parseInt(res.headers['content-length'] || '0', 10)
        res.on('data', (chunk) => {
          received += chunk.length
          const now = Date.now()
          if (now - lastEmit > 200) {
            lastEmit = now
            onProgress?.({ label, received, total, percent: total ? received / total : 0 })
          }
        })
        res.pipe(out)
        out.on('finish', () => {
          out.close(() => {
            try { fs.renameSync(tmp, dest) } catch (e) { return reject(e) }
            onProgress?.({ label, received, total: total || received, percent: 1 })
            resolve()
          })
        })
      })
      req.on('error', reject)
    }
    follow(url)
  })
}

// ── Run a process, streaming each output line through `onLine` ───────────────
function runProcess(bin, args, onLine, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...extraEnv },
    })
    let stderr = ''
    const handleLine = (chunk) => {
      const line = chunk.toString().trim()
      if (line) onLine?.(line)
    }
    proc.stdout.on('data', handleLine)
    proc.stderr.on('data', (d) => { stderr += d.toString(); handleLine(d) })
    proc.on('close', (code) => {
      code === 0
        ? resolve()
        : reject(new Error(`${path.basename(bin)} ${args.join(' ')} → exit ${code}\n${stderr.slice(-500)}`))
    })
    proc.on('error', reject)
  })
}

// ── Setup orchestrator — runs only the phases that need running ──────────────
async function runSetup(app, emit) {
  const { checks, paths: p } = checkSetup(app)

  if (!checks.whisperBin)    throw new Error('whisper-cli não foi empacotado no instalador (bug de build)')
  if (!checks.vadModel)      throw new Error('modelo VAD não foi empacotado no instalador (bug de build)')
  if (!checks.diarizeScript) throw new Error('diarize.py não foi empacotado no instalador (bug de build)')

  // ── Phase 1: whisper model ─────────────────────────────────────────────────
  if (!checks.whisperModel) {
    emit({ phase: 'model', label: 'Baixando o melhor modelo (large-v3, ~1 GB)…', percent: 0 })
    await downloadFile(WHISPER_MODEL_URL, p.whisperModel, 'model', (pr) => {
      const mb = (n) => (n / 1e6).toFixed(0)
      emit({
        phase: 'model',
        label: pr.total
          ? `Modelo de transcrição: ${mb(pr.received)} / ${mb(pr.total)} MB`
          : `Modelo de transcrição: ${mb(pr.received)} MB`,
        percent: pr.percent,
      })
    })
    if (fs.statSync(p.whisperModel).size < MIN_MODEL_BYTES) {
      fs.unlinkSync(p.whisperModel)
      throw new Error('Download do modelo incompleto. Verifique a conexão e tente novamente.')
    }
  }

  // ── Phase 2: Python venv + torch + pyannote.audio ──────────────────────────
  if (!checks.pyannoteVenv) {
    // If a venv directory exists but failed the schema check, it was built
    // by a previous version with incompatible Python deps — nuke it so the
    // fresh install lands on the current pinned pyannote.audio.
    if (fs.existsSync(p.venvDir)) {
      emit({ phase: 'venv', label: 'Removendo ambiente Python antigo…', percent: 0 })
      fs.rmSync(p.venvDir, { recursive: true, force: true })
      // Force a re-download of pyannote weights too — they may have been
      // produced by an older incompatible HF cache layout.
      try { fs.rmSync(p.setupMarker, { force: true }) } catch (_) {}
    }
    emit({ phase: 'venv', label: 'Criando ambiente Python isolado…', percent: 0 })
    const sysPy = findSystemPython(app)
    if (!sysPy) {
      throw new Error(process.platform === 'win32'
        ? 'Runtime Python não encontrado em resources/python/runtime/ (bug de empacotamento)'
        : 'Python 3 não encontrado. macOS: `brew install python@3.11`. Linux: `sudo apt install python3 python3-venv`.')
    }
    fs.mkdirSync(path.dirname(p.venvDir), { recursive: true })
    await runProcess(sysPy, ['-m', 'venv', p.venvDir], (l) => emit({ phase: 'venv', label: l, percent: 0.1 }))

    emit({ phase: 'venv', label: 'Atualizando pip…', percent: 0.15 })
    await runProcess(p.venvPip, ['install', '--upgrade', 'pip', '--quiet'])

    emit({ phase: 'venv', label: 'Instalando PyTorch CPU (~1.0 GB, pode demorar)…', percent: 0.25 })
    await runProcess(
      p.venvPip,
      ['install', 'torch', 'torchaudio', '--index-url', 'https://download.pytorch.org/whl/cpu', '--quiet'],
      (l) => emit({ phase: 'venv', label: l.slice(0, 80), percent: 0.45 })
    )

    emit({ phase: 'venv', label: 'Instalando pyannote.audio (~500 MB)…', percent: 0.7 })
    // pyannote.audio 3.3.x still passes `use_auth_token=` through to
    // hf_hub_download() — huggingface_hub 0.24+ removed that kwarg entirely,
    // so we pin huggingface_hub to the last branch that accepts it as a
    // (deprecated but functional) alias for token=. Updating once pyannote
    // upstream fixes the forwarding will let us drop both pins.
    await runProcess(
      p.venvPip,
      ['install', 'pyannote.audio>=3.3', 'huggingface_hub<0.24', '--quiet'],
      (l) => emit({ phase: 'venv', label: l.slice(0, 80), percent: 0.9 })
    )

    // Write a schema-version marker so a future API break can re-create the
    // venv automatically instead of confusing the user with kwarg TypeErrors.
    fs.writeFileSync(path.join(p.venvDir, '.skribe-venv-schema'), '1', 'utf8')
  }

  // ── Phase 3: pyannote model weights ────────────────────────────────────────
  if (!fs.existsSync(p.setupMarker)) {
    emit({ phase: 'weights', label: 'Baixando pesos do pyannote.audio (~100 MB)…', percent: 0 })
    fs.mkdirSync(p.hfCache, { recursive: true })

    const downloadScript = path.join(os.tmpdir(), `skribe_pyannote_dl_${Date.now()}.py`)
    fs.writeFileSync(downloadScript, [
      'import os, sys',
      `os.environ["HF_HOME"] = ${JSON.stringify(p.hfCache)}`,
      'from pyannote.audio import Pipeline',
      'Pipeline.from_pretrained("pyannote/speaker-diarization-3.1", use_auth_token=sys.argv[1])',
      'print("OK")',
    ].join('\n'))

    try {
      await runProcess(
        p.venvPython,
        [downloadScript, HF_TOKEN],
        (l) => emit({ phase: 'weights', label: l.slice(0, 80), percent: 0.5 }),
        { HF_HOME: p.hfCache }
      )
      fs.writeFileSync(p.setupMarker, '1')
    } finally {
      try { fs.unlinkSync(downloadScript) } catch (_) {}
    }
  }

  emit({ phase: 'done', label: 'Tudo pronto!', percent: 1 })
}

module.exports = { checkSetup, runSetup, HF_TOKEN, paths, bundledBase, userBase }
