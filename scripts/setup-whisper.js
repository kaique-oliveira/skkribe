#!/usr/bin/env node
/**
 * setup-whisper.js
 * Compila o whisper.cpp com suporte Metal (Apple Silicon GPU)
 * e baixa o modelo ggml-base.bin (~148 MB).
 *
 * Uso: npm run setup:whisper
 */

const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const https = require('https')

const ROOT = path.join(__dirname, '..')
const WHISPER_DIR = path.join(ROOT, 'vendor/whisper.cpp')
const RESOURCES_DIR = path.join(ROOT, 'resources/whisper')
const MODELS_DIR = path.join(RESOURCES_DIR, 'models')
const BIN_DEST = path.join(RESOURCES_DIR, 'main')
const MODEL_DEST = path.join(MODELS_DIR, 'ggml-medium.bin')

const MODEL_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin'

// ── Helpers ────────────────────────────────────────────────────────────────

function run(cmd, cwd = ROOT) {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function which(bin) {
  const r = spawnSync('which', [bin])
  return r.status === 0
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`\n⬇  Baixando ${path.basename(dest)}…`)
    const file = fs.createWriteStream(dest)
    const req = https.get(url, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        file.close()
        fs.unlinkSync(dest)
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      const total = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      res.on('data', (chunk) => {
        received += chunk.length
        if (total) {
          const pct = ((received / total) * 100).toFixed(1)
          process.stdout.write(`\r   ${pct}% (${(received / 1e6).toFixed(1)} MB)`)
        }
      })
      res.pipe(file)
      file.on('finish', () => { file.close(); console.log(''); resolve() })
    })
    req.on('error', (err) => { fs.unlinkSync(dest); reject(err) })
  })
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧  TranscribeApp — Setup do whisper.cpp\n')

  // 1. Verifica dependências
  const deps = ['git', 'cmake', 'ffmpeg']
  const missing = deps.filter((d) => !which(d))
  if (missing.length > 0) {
    console.error(`❌  Dependências faltando: ${missing.join(', ')}`)
    console.error('   Instale com: brew install ' + missing.join(' '))
    process.exit(1)
  }
  console.log('✅  Dependências: git, cmake, ffmpeg encontrados')

  // 2. Clona (ou atualiza) whisper.cpp
  ensureDir(path.join(ROOT, 'vendor'))
  if (!fs.existsSync(path.join(WHISPER_DIR, 'CMakeLists.txt'))) {
    run(`git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git ${WHISPER_DIR}`)
  } else {
    console.log('✅  whisper.cpp já clonado — pulando clone')
  }

  // 3. Compila com Metal (GPU Apple Silicon) e linking estático
  const buildDir = path.join(WHISPER_DIR, 'build')
  ensureDir(buildDir)

  run(
    'cmake .. -DWHISPER_METAL=ON -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF',
    buildDir
  )
  run('cmake --build . --config Release -j$(sysctl -n hw.logicalcpu)', buildDir)

  // 4. Copia o binário
  const candidates = [
    path.join(buildDir, 'bin/whisper-cli'),
    path.join(buildDir, 'bin/main'),
    path.join(buildDir, 'whisper-cli'),
    path.join(buildDir, 'main'),
  ]
  const src = candidates.find((p) => fs.existsSync(p))

  if (!src) {
    console.error('❌  Binário não encontrado após compilação. Verifique os logs acima.')
    process.exit(1)
  }

  ensureDir(RESOURCES_DIR)
  fs.copyFileSync(src, BIN_DEST)
  fs.chmodSync(BIN_DEST, 0o755)
  console.log(`✅  Binário copiado → resources/whisper/main`)

  // 4b. Copia libwhisper se existir (fallback para builds dinâmicos)
  const libCandidates = [
    path.join(buildDir, 'src/libwhisper.1.dylib'),
    path.join(buildDir, 'src/libwhisper.dylib'),
    path.join(buildDir, 'libwhisper.1.dylib'),
    path.join(buildDir, 'libwhisper.dylib'),
  ]
  const libSrc = libCandidates.find((p) => fs.existsSync(p))
  if (libSrc) {
    const libDest = path.join(RESOURCES_DIR, path.basename(libSrc))
    fs.copyFileSync(libSrc, libDest)
    console.log(`✅  Lib copiada → resources/whisper/${path.basename(libSrc)}`)
    // Corrige o rpath do binário para encontrar a lib no mesmo diretório
    try {
      execSync(`install_name_tool -add_rpath @executable_path ${BIN_DEST}`, { stdio: 'pipe' })
    } catch (_) {}
  }

  // 5. Baixa o modelo
  ensureDir(MODELS_DIR)
  if (fs.existsSync(MODEL_DEST)) {
    console.log('✅  Modelo ggml-medium.bin já existe — pulando download')
  } else {
    await downloadFile(MODEL_URL, MODEL_DEST)
    console.log('✅  Modelo baixado → resources/whisper/models/ggml-medium.bin')
  }

  console.log('\n🎉  Setup concluído! Rode: npm run dev\n')
}

main().catch((err) => {
  console.error('\n❌  Erro no setup:', err.message)
  process.exit(1)
})
