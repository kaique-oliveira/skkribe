#!/usr/bin/env node
/**
 * setup-whisper.js, clones whisper.cpp at a stable tag, builds the `main`
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

// Set SKKRIBE_VULKAN=1 (CI does, on win/linux) to additionally build a
// Vulkan-enabled binary (`main-vulkan`). It ships alongside the CPU one; the
// app probes it at runtime and falls back to CPU when the machine has no
// Vulkan loader/driver. Requires the Vulkan SDK (VULKAN_SDK env var).
const WANT_VULKAN = process.env.SKKRIBE_VULKAN === '1' && process.platform !== 'darwin'

/** Configure + build whisper-cli in `buildDir` with `extraFlags`, then copy the
 *  resulting binary to resources/whisper/<dstName>. */
function buildWhisperCli(buildDir, extraFlags, dstName) {
  // Base flags per platform:
  //   macOS   → Metal + Accelerate. GGML_NATIVE=ON is fine there: we always
  //             build on Apple Silicon for Apple Silicon (same baseline).
  //   win/linux → GGML_NATIVE=OFF! These binaries are DISTRIBUTED: a build
  //             with -march=native on a GitHub runner crashes with "illegal
  //             instruction" on any user CPU older than the runner's
  //             (whisper.cpp's own CI turns it off for release binaries).
  //             AVX2 is the practical x86-64 baseline (Haswell 2013+).
  //   CoreML is intentionally OFF: Electron ships cross-platform and we don't
  //   want a Mac-only model requirement.
  const isMac = process.platform === 'darwin'
  const flags = [
    '-DCMAKE_BUILD_TYPE=Release',
    isMac ? '-DGGML_METAL=ON -DGGML_METAL_EMBED_LIBRARY=ON' : '',
    isMac ? '-DGGML_NATIVE=ON' : '-DGGML_NATIVE=OFF -DGGML_AVX2=ON',
    isMac ? '-DGGML_ACCELERATE=ON' : '',
    '-DWHISPER_BUILD_TESTS=OFF',
    '-DWHISPER_BUILD_EXAMPLES=ON',
    '-DBUILD_SHARED_LIBS=OFF',
    ...extraFlags,
  ].filter(Boolean).join(' ')

  run(`cmake -B "${buildDir}" -S "${BUILD_DIR}" ${flags}`)
  run(`cmake --build "${buildDir}" --config Release --target whisper-cli -j`)

  // Multi-config generators (Visual Studio on Windows) place the binary in
  // bin/Release/, single-config generators (Makefiles, Ninja) in bin/.
  const binName = process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'
  const candidates = [
    path.join(buildDir, 'bin', 'Release', binName),
    path.join(buildDir, 'bin', binName),
  ]
  const srcBin = candidates.find((p) => fs.existsSync(p))
  if (!srcBin) {
    throw new Error(`whisper-cli não foi encontrado em nenhum dos caminhos esperados:\n${candidates.join('\n')}`)
  }
  const dstBin = path.join(RES, process.platform === 'win32' ? `${dstName}.exe` : dstName)
  fs.copyFileSync(srcBin, dstBin)
  if (process.platform !== 'win32') fs.chmodSync(dstBin, 0o755)
  return dstBin
}

async function main() {
  console.log('\n🔧 setup-whisper.js, building whisper.cpp', WHISPER_TAG)

  // Marker includes the variant actually produced, so flipping SKKRIBE_VULKAN
  // (or a Vulkan build that failed last time) triggers a rebuild instead of
  // being silently skipped.
  const wantedMarker = WANT_VULKAN ? `${WHISPER_TAG}+vulkan` : WHISPER_TAG
  if (existing() === wantedMarker) {
    console.log('✓ Já está na versão', wantedMarker, ', pulando build')
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

  const cpuBin = buildWhisperCli(path.join(BUILD_DIR, 'build'), [], 'main')
  console.log('\n✅ whisper.cpp (CPU/Metal) pronto em', cpuBin)

  // The Vulkan binary is strictly optional: the app probes it at runtime and
  // falls back to the CPU build when it's missing or the machine has no driver.
  // So a failed Vulkan build (no SDK, missing glslc, driver-less runner) must
  // degrade to a CPU-only package instead of failing the whole release.
  let vulkanOk = false
  if (WANT_VULKAN) {
    try {
      if (!process.env.VULKAN_SDK && process.platform === 'win32') {
        throw new Error('VULKAN_SDK não está definido')
      }
      const vkBin = buildWhisperCli(path.join(BUILD_DIR, 'build-vulkan'), ['-DGGML_VULKAN=ON'], 'main-vulkan')
      console.log('\n✅ whisper.cpp (Vulkan) pronto em', vkBin)
      vulkanOk = true
    } catch (err) {
      console.warn('\n⚠️  Build Vulkan falhou, seguindo só com o binário de CPU.')
      console.warn('   Motivo:', err.message)
      // Remove a stale binary from a previous run so the app doesn't probe one
      // that doesn't match this build.
      try { fs.unlinkSync(path.join(RES, process.platform === 'win32' ? 'main-vulkan.exe' : 'main-vulkan')) } catch (_) {}
    }
  }

  fs.writeFileSync(VERSION_MARKER, vulkanOk ? `${WHISPER_TAG}+vulkan` : WHISPER_TAG)

  // ── Silero VAD, required by --vad in the pipeline.
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
 *  execSync('sleep')` polling loop, which blocks the Node event loop and
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
      const req = https.get(currentUrl, { headers: { 'user-agent': 'skkribe-setup' } }, (res) => {
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
