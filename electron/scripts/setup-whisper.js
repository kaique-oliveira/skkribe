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

function main() {
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

  const srcBin = path.join(BUILD_DIR, 'build', 'bin', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli')
  const dstBin = path.join(RES, process.platform === 'win32' ? 'main.exe' : 'main')
  fs.copyFileSync(srcBin, dstBin)
  fs.chmodSync(dstBin, 0o755)

  fs.writeFileSync(VERSION_MARKER, WHISPER_TAG)
  console.log('\n✅ whisper.cpp pronto em', dstBin)

  // ── Silero VAD — required by --vad in the pipeline.
  // Without it the transcriber hallucinates "Legenda por…" / "[Música]" in
  // silent regions, which then poisons the diarization downstream.
  if (!fs.existsSync(VAD_BIN)) {
    console.log('\n📥 Baixando Silero VAD (~864 KB)…')
    const https = require('node:https')
    const out = fs.createWriteStream(VAD_BIN)
    function follow(url, hops = 0) {
      if (hops > 5) throw new Error('too many redirects')
      https.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return follow(new URL(res.headers.location, url).toString(), hops + 1)
        }
        if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}`)
        res.pipe(out)
      })
    }
    follow(SILERO_VAD_URL)
    // Sync-ish wait — block until the file finishes writing.
    while (!fs.existsSync(VAD_BIN) || fs.statSync(VAD_BIN).size < 500_000) {
      execSync('sleep 0.5')
    }
    console.log('✅ Silero VAD pronto em', VAD_BIN)
  } else {
    console.log('✓ Silero VAD já presente em', VAD_BIN)
  }
}

main()
