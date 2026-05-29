#!/usr/bin/env node
/**
 * download-model.js, fetches a whisper.cpp GGML model into resources/whisper/models/
 * Always picks a quantized variant when available (smaller + faster, ~1% WER cost).
 *
 * Run: npm run setup:model                        # small + q5_1 (default)
 *      npm run setup:model -- --model=medium      # specific model
 *      npm run setup:model -- --model=large-v3-turbo
 *      npm run setup:model -- --model=small --quant=q5_0
 */

const fs = require('node:fs')
const path = require('node:path')
const https = require('node:https')

const ROOT = path.join(__dirname, '..')
const MODELS_DIR = path.join(ROOT, 'resources', 'whisper', 'models')

const VALID_MODELS = ['tiny', 'base', 'small', 'medium', 'large-v3', 'large-v3-turbo']
const BEST_QUANT = {
  tiny: 'q5_1', base: 'q5_1', small: 'q5_1', medium: 'q5_0',
  'large-v3': 'q5_0', 'large-v3-turbo': 'q5_0',
}
const MIN_VALID_SIZE = 10 * 1024 * 1024   // anything smaller is a corrupted/half-finished download

function arg(name, fallback) {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3).trim() : fallback
}

function download(url, dest, label) {
  return new Promise((resolve, reject) => {
    let received = 0
    let total = 0
    let lastPrint = 0
    const out = fs.createWriteStream(dest)

    function follow(currentUrl, redirects = 0) {
      if (redirects > 5) return reject(new Error(`Too many redirects for ${currentUrl}`))
      https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          return follow(new URL(res.headers.location, currentUrl).toString(), redirects + 1)
        }
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`HTTP ${res.statusCode} on ${currentUrl}`))
        }
        total = parseInt(res.headers['content-length'] || '0', 10)
        res.on('data', (chunk) => {
          received += chunk.length
          if (Date.now() - lastPrint > 250) {
            const pct = total ? ((received / total) * 100).toFixed(1) : '?'
            process.stdout.write(`\r  ${label}: ${pct}%  ${(received / 1e6).toFixed(1)} MB`)
            lastPrint = Date.now()
          }
        })
        res.pipe(out)
        out.on('finish', () => { out.close(); process.stdout.write('\n'); resolve() })
      }).on('error', reject)
    }
    follow(url)
  })
}

async function main() {
  // Default to large-v3 (the full one). It's noticeably better than turbo on
  // proper nouns and rare words (turbo's distillation loses ~15-20% accuracy
  // on uncommon vocabulary even though overall WER is close). Users on
  // tighter time budgets can pass --model=large-v3-turbo or smaller.
  const model = arg('model', 'large-v3')
  if (!VALID_MODELS.includes(model)) {
    console.error(`❌ Model inválido: ${model}\n   Use: ${VALID_MODELS.join(' | ')}`)
    process.exit(1)
  }
  const quant = arg('quant', BEST_QUANT[model] || 'q5_1')

  fs.mkdirSync(MODELS_DIR, { recursive: true })

  const filename = `ggml-${model}-${quant}.bin`
  const dest = path.join(MODELS_DIR, filename)

  if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_VALID_SIZE) {
    console.log(`✓ ${filename} já existe (${(fs.statSync(dest).size / 1e6).toFixed(1)} MB), pulando`)
    return
  }
  if (fs.existsSync(dest)) {
    console.log(`⚠ ${filename} existe mas corrompido, removendo`)
    fs.unlinkSync(dest)
  }

  const url = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${filename}`
  console.log(`📥 Baixando ${filename} de ${url}`)
  await download(url, dest, filename)

  const sz = fs.statSync(dest).size
  if (sz < MIN_VALID_SIZE) {
    fs.unlinkSync(dest)
    console.error(`❌ Download incompleto (${sz} bytes), tente de novo`)
    process.exit(1)
  }
  console.log(`✅ Pronto, ${(sz / 1e6).toFixed(1)} MB`)
}

main().catch((err) => { console.error('❌', err.message); process.exit(1) })
