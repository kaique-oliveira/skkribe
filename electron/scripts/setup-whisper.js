#!/usr/bin/env node
/**
 * setup-whisper.js — clones whisper.cpp at a stable tag, builds the `main`
 * binary with Metal (macOS) or Vulkan/CUDA-disabled (others), and drops it
 * into resources/whisper/main. Bundled by electron-builder via extraResources.
 *
 * Run: npm run setup:whisper
 */

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const WHISPER_TAG = 'v1.8.4'
const SILERO_VAD_URL = 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v5.1.2.bin'
const ROOT = path.join(__dirname, '..')
const RES = path.join(ROOT, 'resources', 'whisper')
// Intermediate build artifacts go to .cache/ to avoid colliding with
// electron-builder's `build/` convention (icons + buildResources).
const BUILD_DIR = path.join(ROOT, '.cache', 'whisper.cpp')
const VERSION_MARKER = path.join(RES, '.whisper-version')
const VAD_BIN = path.join(RES, 'ggml-silero-v5.1.2.bin')

function run(cmd, opts = {}) {
  console.log(`▶ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

function existing() {
  if (!fs.existsSync(VERSION_MARKER)) return null
  try { return fs.readFileSync(VERSION_MARKER, 'utf8').trim() } catch { return null }
}

function ensureCmake() {
  const r = spawnSync('cmake', ['--version'])
  if (r.status !== 0) {
    console.error('❌ cmake não encontrado. macOS: brew install cmake')
    process.exit(1)
  }
}

async function main() {
  console.log('\n🔧 setup-whisper.js — building whisper.cpp', WHISPER_TAG)

  if (existing() === WHISPER_TAG) {
    console.log('✓ Já está na versão', WHISPER_TAG, '— pulando build')
    return
  }
  ensureCmake()

  fs.mkdirSync(RES, { recursive: true })
  fs.mkdirSync(path.join(RES, 'models'), { recursive: true })
  fs.mkdirSync(BUILD_DIR, { recursive: true })

  // Clone / checkout pinned tag
  if (!fs.existsSync(path.join(BUILD_DIR, '.git'))) {
    run(`git clone --depth 1 --branch ${WHISPER_TAG} https://github.com/ggml-org/whisper.cpp.git "${BUILD_DIR}"`)
  } else {
    run(`git -C "${BUILD_DIR}" fetch --depth 1 origin ${WHISPER_TAG}`)
    run(`git -C "${BUILD_DIR}" checkout ${WHISPER_TAG}`)
  }

  // Build flags — Metal on macOS, plain Accelerate elsewhere. CoreML is intentionally
  // OFF here because Electron ships cross-platform and we don't want a Mac-only model
  // requirement. Users on Mac who want ANE speed can switch to the native Swift port.
  const isMac = process.platform === 'darwin'
  const flags = [
    '-DCMAKE_BUILD_TYPE=Release',
    isMac ? '-DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON' : '',
    '-DGGML_NATIVE=ON',
    isMac ? '-DGGML_ACCELERATE=ON' : '',
    '-DWHISPER_BUILD_TESTS=OFF',
    '-DWHISPER_BUILD_EXAMPLES=ON',
    '-DBUILD_SHARED_LIBS=OFF',
  ].filter(Boolean).join(' ')

  run(`cmake -B "${BUILD_DIR}/build" -S "${BUILD_DIR}" ${flags}`)
  run(`cmake --build "${BUILD_DIR}/build" --config Release --target whisper-cli -j`)

  // Multi-config generators (Visual Studio on Windows) place the binary in
  // build/bin/Release/, while single-config generators (Makefiles, Ninja on
  // Mac/Linux) put it directly in build/bin/. Try both.
  const binName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const candidates = [
    path.join(BUILD_DIR, 'build', 'bin', 'Release', binName),
    path.join(BUILD_DIR, 'build', 'bin', binName),
  ]
  const srcBin = candidates.find((p) => fs.existsSync(p))
  if (!srcBin) {
    throw new Error(`whisper-cli não foi encontrado em nenhum dos caminhos esperados:\n${candidates.join('\n')}`)
  }
  const dstBin = path.join(RES, process.platform === 'win32' ? 'main.exe' : 'main')
  fs.copyFileSync(srcBin, dstBin)
  if (process.platform !== 'win32') fs.chmodSync(dstBin, 0o755)

  fs.writeFileSync(VERSION_MARKER, WHISPER_TAG)
  console.log('\n✅ whisper.cpp pronto em', dstBin)

  // ── Silero VAD — required by --vad in the pipeline.
  // Without it the transcriber hallucinates "Legenda por…" / "[Música]" in
  // silent regions, which then poisons the diarization downstream.
  if (!fs.existsSync(VAD_BIN)) {
    console.log('\n📥 Baixando Silero VAD (~864 KB)…')
    await downloadFile(SILERO_VAD_URL, VAD_BIN)
    console.log('✅ Silero VAD pronto em', VAD_BIN)
  } else {
    console.log('✓ Silero VAD já presente em', VAD_BIN)
  }
}

/** Promise-based HTTPS download with redirect follow + atomic .part rename.
 *  The old implementation kicked off https.get and then sat in a sync `while +
 *  execSync('sleep')` polling loop — which blocks the Node event loop and
 *  prevents the response callback from ever firing. Deadlock in CI (locally
 *  the existing VAD file made the code path short-circuit). */
function downloadFile(url, dest) {
  const https = require('node:https')
  const tmp = dest + '.part'
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const out = fs.createWriteStream(tmp)
    function follow(currentUrl, hops = 0) {
      if (hops > 5) return reject(new Error(`muitos redirects em ${currentUrl}`))
      const req = https.get(currentUrl, { headers: { 'user-agent': 'skribe-setup' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return follow(new URL(res.headers.location, currentUrl).toString(), hops + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} em ${currentUrl}`))
        }
        res.pipe(out)
        out.on('finish', () => {
          out.close((err) => {
            if (err) return reject(err)
            try { fs.renameSync(tmp, dest) } catch (e) { return reject(e) }
            resolve()
          })
        })
        out.on('error', reject)
      })
      req.on('error', reject)
    }
    follow(url)
  })
}

main().catch((err) => { console.error('\n❌', err.message); process.exit(1) })
