#!/usr/bin/env node
/**
 * setup-diarization.js, sets up an isolated Python venv with pyannote.audio 4
 * + PyTorch CPU and pre-downloads the pyannote/speaker-diarization-community-1
 * model weights. Uses the committed resources/python/diarize.py (single source
 * of truth, no embedded copy here).
 *
 * Run: npm run setup:diarization -- --token=hf_xxxxxxxxxxxx
 *
 * The HF token is needed once to fetch the gated model. Accept the conditions at:
 *   https://huggingface.co/pyannote/speaker-diarization-community-1
 * before generating the token at https://huggingface.co/settings/tokens.
 */

const { execSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const PY_DIR = path.join(ROOT, 'resources', 'python')
const VENV_DIR = path.join(PY_DIR, 'venv')
const VENV_BIN = process.platform === 'win32' ? 'Scripts' : 'bin'
const VENV_PY  = path.join(VENV_DIR, VENV_BIN, process.platform === 'win32' ? 'python.exe' : 'python')
const VENV_PIP = path.join(VENV_DIR, VENV_BIN, process.platform === 'win32' ? 'pip.exe' : 'pip')
const DIARIZE_PY = path.join(PY_DIR, 'diarize.py')
const CONFIG = path.join(PY_DIR, '.diarization-config.json')


function run(cmd) { console.log(`▶ ${cmd}`); execSync(cmd, { stdio: 'inherit' }) }

function getPython() {
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, ['--version'])
    if (r.status === 0) return bin
  }
  return null
}

function main() {
  console.log('\n🔧 setup-diarization.js, pyannote.audio venv + model\n')

  const tokenArg = process.argv.find((a) => a.startsWith('--token='))
  const hfToken  = tokenArg && tokenArg.slice('--token='.length).trim()
  if (!hfToken) {
    console.error('❌ HF token ausente.')
    console.error('   Uso: npm run setup:diarization -- --token=hf_xxxxxxxx')
    process.exit(1)
  }
  // Catch the most common mistake: pasting a non-HF style key (sk_…)
  // or a personal API key from somewhere else. HuggingFace tokens always start
  // with `hf_`. Failing fast here saves a 2 GB torch download + venv build for
  // nothing.
  if (!hfToken.startsWith('hf_')) {
    console.error('❌ Token inválido, formato esperado: hf_xxxxxxxx (Hugging Face).')
    console.error(`   Você passou: ${hfToken.slice(0, 8)}…  (prefixo errado)`)
    console.error('')
    console.error('   Crie um token grátis em:  https://huggingface.co/settings/tokens')
    console.error('   E aceite as condições em:')
    console.error('     https://huggingface.co/pyannote/speaker-diarization-community-1')
    process.exit(1)
  }

  fs.mkdirSync(PY_DIR, { recursive: true })
  if (!fs.existsSync(DIARIZE_PY)) {
    console.error('❌ resources/python/diarize.py não encontrado (repo incompleto?)')
    process.exit(1)
  }

  const sysPython = getPython()
  if (!sysPython) {
    console.error('❌ Python 3 não encontrado. macOS: brew install python@3.11')
    process.exit(1)
  }

  if (!fs.existsSync(VENV_PY)) {
    run(`${sysPython} -m venv "${VENV_DIR}"`)
  }

  run(`"${VENV_PIP}" install --upgrade pip --quiet`)
  console.log('\n📦 Instalando torch (CPU) + pyannote.audio (pode demorar)…\n')
  run(`"${VENV_PIP}" install --quiet torch torchaudio --index-url https://download.pytorch.org/whl/cpu`)
  run(`"${VENV_PIP}" install --quiet "pyannote.audio>=4,<5"`)

  console.log('\n📥 Baixando pesos do pyannote/speaker-diarization-community-1 (uma vez)…\n')
  const downloadScript = path.join(PY_DIR, '_download.py')
  fs.writeFileSync(downloadScript, [
    'from pyannote.audio import Pipeline',
    'import sys',
    'token = sys.argv[1]',
    'Pipeline.from_pretrained("pyannote/speaker-diarization-community-1", token=token)',
    'print("OK")',
  ].join('\n'))
  try {
    run(`"${VENV_PY}" "${downloadScript}" "${hfToken}"`)
  } finally {
    try { fs.unlinkSync(downloadScript) } catch (_) {}
  }

  fs.writeFileSync(CONFIG, JSON.stringify({
    pythonBin: VENV_PY,
    hfToken,
    installedAt: new Date().toISOString(),
  }, null, 2))

  console.log('\n✅ Diarização pronta. Você pode rodar `npm run dev` agora.\n')
}

main()
