#!/usr/bin/env node
/**
 * setup-diarization.js
 * Cria um venv isolado em resources/python/venv,
 * instala pyannote.audio + PyTorch e baixa o modelo.
 *
 * Uso: npm run setup:diarization -- --token=hf_SEU_TOKEN
 */

const { execSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT        = path.join(__dirname, '..')
const VENV_DIR    = path.join(ROOT, 'resources/python/venv')
const VENV_PIP    = path.join(VENV_DIR, 'bin/pip')
const VENV_PYTHON = path.join(VENV_DIR, 'bin/python')
const CONFIG_FILE = path.join(ROOT, 'resources/python/.diarization-config.json')

// ── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd, opts = {}) {
  console.log(`\n▶ ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

function getPython() {
  const candidates = ['python3', 'python']
  for (const bin of candidates) {
    const r = spawnSync(bin, ['--version'])
    if (r.status === 0) {
      const ver = (r.stdout.toString() || r.stderr.toString()).trim()
      console.log(`✅  Python encontrado: ${ver} (${bin})`)
      return bin
    }
  }
  return null
}

function checkPythonVersion(bin) {
  const r = spawnSync(bin, ['-c', 'import sys; print(sys.version_info.major, sys.version_info.minor)'])
  if (r.status !== 0) return false
  const [major, minor] = r.stdout.toString().trim().split(' ').map(Number)
  return major === 3 && minor >= 9
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔧  TranscribeApp — Setup da Diarização (pyannote.audio)\n')

  // Token
  const tokenArg = process.argv.find((a) => a.startsWith('--token='))
  const hfToken  = tokenArg ? tokenArg.replace('--token=', '').trim() : null

  if (!hfToken) {
    console.error('❌  Token do HuggingFace não informado.')
    console.error('   Uso: npm run setup:diarization -- --token=hf_SEU_TOKEN')
    console.error('\n   Obtenha grátis em: https://huggingface.co/settings/tokens')
    console.error('   Aceite os termos em: https://huggingface.co/pyannote/speaker-diarization-3.1')
    process.exit(1)
  }

  // 1. Verifica Python do sistema
  const sysPython = getPython()
  if (!sysPython) {
    console.error('\n❌  Python 3 não encontrado.')
    console.error('   Instale com: brew install python@3.11')
    process.exit(1)
  }

  if (!checkPythonVersion(sysPython)) {
    console.error('❌  Python 3.9+ necessário.')
    process.exit(1)
  }

  // 2. Cria venv isolado (evita o bloqueio do Homebrew)
  fs.mkdirSync(path.join(ROOT, 'resources/python'), { recursive: true })

  if (fs.existsSync(VENV_PYTHON)) {
    console.log('✅  venv já existe — pulando criação')
  } else {
    console.log('\n📦  Criando ambiente virtual isolado em resources/python/venv…')
    run(`${sysPython} -m venv "${VENV_DIR}"`)
  }

  // 3. Atualiza pip dentro do venv
  run(`"${VENV_PIP}" install --upgrade pip --quiet`)

  // 4. Instala PyTorch (versão CPU — funciona em Intel e Apple Silicon via MPS)
  console.log('\n📦  Instalando PyTorch (~2 GB, pode demorar alguns minutos)…\n')
  run(`"${VENV_PIP}" install torch torchaudio --index-url https://download.pytorch.org/whl/cpu`)

  // 5. Instala pyannote.audio
  console.log('\n📦  Instalando pyannote.audio…\n')
  run(`"${VENV_PIP}" install pyannote.audio`)

  // 6. Pré-baixa o modelo
  console.log('\n📥  Baixando modelo pyannote/speaker-diarization-3.1…')
  console.log('   (Primeira vez leva alguns minutos)\n')

  const downloadScript = `
import sys
from pyannote.audio import Pipeline
print("Carregando modelo (pode baixar arquivos na primeira vez)...")
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    token="${hfToken}"
)
print("Modelo OK!")
`
  const tmpScript = path.join(ROOT, 'resources/python/_download_model.py')
  fs.writeFileSync(tmpScript, downloadScript)

  try {
    run(`"${VENV_PYTHON}" "${tmpScript}"`)
  } finally {
    try { fs.unlinkSync(tmpScript) } catch (_) {}
  }

  // 7. Salva config com caminho do Python do venv
  const config = {
    pythonBin: VENV_PYTHON,
    hfToken,
    installedAt: new Date().toISOString(),
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))

  console.log('\n🎉  Diarização configurada! Reinicie o app para usar.\n')
}

main().catch((err) => {
  console.error('\n❌  Erro no setup:', err.message)
  process.exit(1)
})
