#!/usr/bin/env node
/**
 * download-model.js
 * Baixa modelos quantizados do whisper.cpp (q5_0 — 2x–4x mais rápidos)
 *
 * Uso:
 *   npm run setup:model              → baixa ggml-small-q5_0 (padrão recomendado)
 *   npm run setup:model -- --model=base
 *   npm run setup:model -- --model=medium
 *   npm run setup:model -- --model=large-v3
 *   npm run setup:model -- --quant=q4_0   → quantização mais agressiva (menor, mais rápido)
 */

const fs    = require('fs')
const path  = require('path')
const https = require('https')
const http  = require('http')

const ROOT       = path.join(__dirname, '..')
const MODELS_DIR = path.join(ROOT, 'resources/whisper/models')

// Argumentos
const args   = process.argv.slice(2)
const getArg = (name) => {
  const found = args.find(a => a.startsWith(`--${name}=`))
  return found ? found.split('=')[1] : null
}

const MODEL = getArg('model') || 'small'
const QUANT = getArg('quant') || 'q5_0'

// Tabela real de modelos disponíveis no HuggingFace (ggerganov/whisper.cpp)
// Quantizações disponíveis variam por modelo — mapeamento exato dos arquivos existentes
const MODEL_URLS = {
  // ── tiny ──────────────────────────────────────────────────────────────────
  'tiny-q5_1':          'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin',
  'tiny-q8_0':          'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q8_0.bin',
  'tiny':               'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
  // ── base ──────────────────────────────────────────────────────────────────
  'base-q5_1':          'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
  'base-q8_0':          'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q8_0.bin',
  'base':               'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
  // ── small ─────────────────────────────────────────────────────────────────
  'small-q5_1':         'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
  'small-q8_0':         'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q8_0.bin',
  'small':              'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
  // ── medium ────────────────────────────────────────────────────────────────
  'medium-q5_0':        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q5_0.bin',
  'medium-q8_0':        'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium-q8_0.bin',
  'medium':             'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
  // ── large-v3 ──────────────────────────────────────────────────────────────
  'large-v3-q5_0':      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-q5_0.bin',
  'large-v3':           'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
  // ── large-v3-turbo (mais rápido que large, melhor que medium) ─────────────
  'large-v3-turbo-q5_0':'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
  'large-v3-turbo-q8_0':'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin',
  'large-v3-turbo':     'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
}

// Melhor quantização disponível para cada modelo (ordem de preferência)
const BEST_QUANT = {
  'tiny':          ['q5_1', 'q8_0', 'none'],
  'base':          ['q5_1', 'q8_0', 'none'],
  'small':         ['q5_1', 'q8_0', 'none'],
  'medium':        ['q5_0', 'q8_0', 'none'],
  'large-v3':      ['q5_0', 'none'],
  'large-v3-turbo':['q5_0', 'q8_0', 'none'],
}

const MODEL_INFO = {
  'tiny':          { size: '~32 MB (q5_1)',  quality: 'Básica',    speed: 'Ultra rápido' },
  'base':          { size: '~60 MB (q5_1)',  quality: 'Boa',       speed: 'Muito rápido' },
  'small':         { size: '~190 MB (q5_1)', quality: 'Muito boa', speed: 'Rápido ✓ Recomendado' },
  'medium':        { size: '~539 MB (q5_0)', quality: 'Excelente', speed: 'Moderado' },
  'large-v3':      { size: '~1.1 GB (q5_0)', quality: 'Máxima',   speed: 'Lento' },
  'large-v3-turbo':{ size: '~574 MB (q5_0)', quality: 'Excelente',speed: 'Mais rápido que large' },
}

// Resolve qual quantização usar
let resolvedQuant = QUANT
let key, fileName, url

if (QUANT === 'auto' || !MODEL_URLS[`${MODEL}-${QUANT}`]) {
  // Tenta a melhor quantização disponível para o modelo
  const candidates = BEST_QUANT[MODEL] || ['none']
  for (const q of candidates) {
    const k = q === 'none' ? MODEL : `${MODEL}-${q}`
    if (MODEL_URLS[k]) {
      resolvedQuant = q === 'none' ? '' : q
      key      = k
      fileName = q === 'none' ? `ggml-${MODEL}.bin` : `ggml-${MODEL}-${q}.bin`
      url      = MODEL_URLS[k]
      break
    }
  }
} else {
  key      = QUANT === 'none' ? MODEL : `${MODEL}-${QUANT}`
  fileName = QUANT === 'none' ? `ggml-${MODEL}.bin` : `ggml-${MODEL}-${QUANT}.bin`
  url      = MODEL_URLS[key]
  resolvedQuant = QUANT
}

const destPath = path.join(MODELS_DIR, fileName)

// ── Helpers ─────────────────────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()
    let received = 0
    let lastPrint = 0

    // Abre o WriteStream uma única vez — nunca fecha entre redirects
    const file = fs.createWriteStream(dest)

    file.on('error', (err) => {
      try { fs.unlinkSync(dest) } catch (_) {}
      reject(err)
    })

    function makeRequest(currentUrl, redirectCount) {
      if (redirectCount > 10) {
        file.close()
        try { fs.unlinkSync(dest) } catch (_) {}
        return reject(new Error('Muitos redirects ao baixar o modelo'))
      }

      // Escolhe http ou https conforme o protocolo da URL atual
      const client = currentUrl.startsWith('http://') ? http : https
      const options = new URL(currentUrl)

      const req = client.get(options, (res) => {
        // Segue redirects (301, 302, 303, 307, 308) sem fechar o stream
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume() // descarta o body do redirect
          const location = res.headers.location
          if (!location) {
            file.close()
            try { fs.unlinkSync(dest) } catch (_) {}
            return reject(new Error('Redirect sem Location header'))
          }
          // Resolve URL relativa se necessário
          const nextUrl = location.startsWith('http')
            ? location
            : new URL(location, currentUrl).toString()
          return makeRequest(nextUrl, redirectCount + 1)
        }

        if (res.statusCode !== 200) {
          file.close()
          try { fs.unlinkSync(dest) } catch (_) {}
          return reject(new Error(`HTTP ${res.statusCode} ao baixar o modelo`))
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)

        res.on('data', (chunk) => {
          received += chunk.length
          const now = Date.now()
          if (now - lastPrint > 250) {
            lastPrint = now
            const pct     = total ? ((received / total) * 100).toFixed(1) : '?'
            const mb      = (received / 1e6).toFixed(1)
            const totalMb = total ? (total / 1e6).toFixed(0) : '?'
            const elapsed = (now - startTime) / 1000
            const speed   = elapsed > 1 ? (received / 1e6 / elapsed).toFixed(1) : '...'
            process.stdout.write(`\r   ${pct}% · ${mb} / ${totalMb} MB · ${speed} MB/s   `)
          }
        })

        res.pipe(file, { end: true })

        file.on('finish', () => {
          console.log('\n')
          resolve()
        })
      })

      req.on('error', (err) => {
        file.close()
        try { fs.unlinkSync(dest) } catch (_) {}
        reject(err)
      })

      req.setTimeout(30000, () => {
        req.destroy()
        file.close()
        try { fs.unlinkSync(dest) } catch (_) {}
        reject(new Error('Timeout ao conectar com o servidor'))
      })
    }

    makeRequest(url, 0)
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n⚡  Skribe — Download de Modelo Quantizado\n')

  if (!url || !fileName) {
    console.error(`❌  Modelo não encontrado: "${MODEL}" com quant "${QUANT}"`)
    console.error('\n   Combinações disponíveis:')
    Object.keys(MODEL_URLS).forEach(k => console.error(`   npm run setup:model -- --model=${k.replace(/-q\d[_]\d$/, '')}${k.includes('-q') ? ' --quant=' + k.split('-').slice(-1)[0] : ''}`))
    process.exit(1)
  }

  const info = MODEL_INFO[MODEL] || {}
  console.log(`   Modelo  : ${MODEL}`)
  console.log(`   Quant   : ${resolvedQuant ? resolvedQuant + ' (2x–4x mais rápido, sem perda visível)' : 'nenhuma (modelo completo)'}`)
  if (info.size)    console.log(`   Tamanho : ${info.size}`)
  if (info.speed)   console.log(`   Velocidade: ${info.speed}`)
  if (info.quality) console.log(`   Qualidade: ${info.quality}`)
  console.log(`   Arquivo : ${fileName}`)
  console.log(`   Destino : resources/whisper/models/${fileName}\n`)

  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true })
  }

  if (fs.existsSync(destPath)) {
    const sizeMb = fs.statSync(destPath).size / 1e6
    if (sizeMb < 1) {
      console.log(`⚠️  ${fileName} existe mas está corrompido (${sizeMb.toFixed(1)} MB) — removendo e baixando de novo…`)
      fs.unlinkSync(destPath)
    } else {
      console.log(`✅  ${fileName} já existe (${sizeMb.toFixed(0)} MB) — pulando download`)
      console.log('   Para baixar novamente, delete o arquivo e rode o comando de novo.\n')
      writePerfConfig(MODEL)
      return
    }
  }

  console.log(`⬇  Baixando ${fileName}…`)
  await downloadFile(url, destPath)

  console.log(`✅  Modelo baixado → resources/whisper/models/${fileName}`)

  // Atualiza o perf-config.json para usar este modelo
  writePerfConfig(MODEL)

  console.log('\n🎉  Pronto! O Skribe vai usar este modelo automaticamente.\n')
}

function writePerfConfig(model) {
  const cfgPath = path.join(ROOT, 'resources/perf-config.json')
  let cfg = {}
  try {
    if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  } catch (_) {}
  const { cpus } = require('os')
  cfg.model        = model
  cfg.threads      = Math.min(cpus().length, 8)
  cfg.chunkSeconds = 60
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), 'utf8')
  console.log(`   perf-config.json atualizado → model: "${model}"`)
}

main().catch((err) => {
  console.error('\n❌  Erro:', err.message)
  process.exit(1)
})
