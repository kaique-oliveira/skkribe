import { useEffect, useState, useCallback } from 'react'
import { PopIn } from '../components/PopIn'
import { StatusPill } from '../components/StatusPill'
import { PrimaryButton, LinkButton } from '../components/Buttons'

// First-launch flow:
//   1. Token gate — the user pastes their own HuggingFace token (the app is
//      open source, so we never ship a shared credential). Skipped if a token
//      was already saved on a previous launch.
//   2. Auto-setup — downloads the whisper model (~1 GB), creates the Python
//      venv, installs torch + pyannote, and pre-caches the diarization weights.
//
// Phases mirror runtime-setup.js → emit({ phase, label, percent }).
const PHASE_META = {
  model:   { title: 'Modelo de transcrição',  hint: 'Baixando o melhor modelo (large-v3, ~1 GB).' },
  venv:    { title: 'Ambiente Python',         hint: 'Criando ambiente isolado e instalando pyannote.audio + PyTorch.' },
  weights: { title: 'Pesos de identificação',  hint: 'Baixando o modelo que reconhece quem está falando.' },
  done:    { title: 'Pronto!',                 hint: 'Configuração concluída.' },
  error:   { title: 'Erro na configuração',    hint: '' },
}

const PHASE_ORDER = ['model', 'venv', 'weights']

const HF_TOKENS_URL = 'https://huggingface.co/settings/tokens'
const PYANNOTE_LICENSE_URLS = [
  'https://huggingface.co/pyannote/segmentation-3.0',
  'https://huggingface.co/pyannote/speaker-diarization-3.1',
]

export function FirstRunSetup({ onComplete, onFail }) {
  // null = still checking; true = need token form; false = token already saved.
  const [needsToken, setNeedsToken] = useState(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { hasToken } = await window.skkribe.getTokenStatus()
      if (!cancelled) setNeedsToken(!hasToken)
    })()
    return () => { cancelled = true }
  }, [])

  if (needsToken === null) return null // brief flash-free wait
  if (needsToken) {
    return <TokenGate onSaved={() => setNeedsToken(false)} />
  }
  return <SetupProgress onComplete={onComplete} onFail={onFail} />
}

// ── Step 1: token entry ───────────────────────────────────────────────────────
function TokenGate({ onSaved }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const submit = useCallback(async () => {
    setError(null)
    setSaving(true)
    const res = await window.skkribe.saveToken(token.trim())
    setSaving(false)
    if (res?.ok) onSaved()
    else setError(res?.error || 'Não foi possível salvar o token.')
  }, [token, onSaved])

  return (
    <div className="flex flex-col items-center w-full max-w-[460px] mx-auto px-6 pt-8 space-y-5">
      <PopIn>
        <div className="w-14 h-14 rounded-full bg-accent-light flex items-center justify-center text-accent text-2xl">🔑</div>
      </PopIn>

      <PopIn delay={0.05}>
        <div className="text-center space-y-1.5">
          <h1 className="text-[22px] font-bold text-ink-1">Conecte sua conta HuggingFace</h1>
          <p className="text-[13px] text-ink-2">
            O Skkribe usa o modelo de identificação de vozes <b>pyannote.audio</b>,
            que pede um token gratuito. Você só faz isso uma vez.
          </p>
        </div>
      </PopIn>

      <PopIn delay={0.10}>
        <div className="w-full bg-nested rounded-nested px-4 py-3.5 text-[12px] text-ink-2 space-y-2">
          <p className="font-semibold text-ink-1">Como obter (≈2 min):</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Crie uma conta grátis em huggingface.co</li>
            <li>
              Aceite as licenças (botão "Agree") em:
              {PYANNOTE_LICENSE_URLS.map((u) => (
                <button
                  key={u}
                  onClick={() => window.skkribe.openExternal(u)}
                  className="block ml-4 text-accent-soft-text hover:text-accent text-left break-all"
                >
                  • {u.replace('https://huggingface.co/', '')}
                </button>
              ))}
            </li>
            <li>
              Gere um token (tipo <b>Read</b>) em{' '}
              <button
                onClick={() => window.skkribe.openExternal(HF_TOKENS_URL)}
                className="text-accent-soft-text hover:text-accent"
              >
                huggingface.co/settings/tokens
              </button>
            </li>
            <li>Cole o token abaixo (começa com <code>hf_</code>)</li>
          </ol>
        </div>
      </PopIn>

      <PopIn delay={0.15}>
        <div className="w-full space-y-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && token.trim()) submit() }}
            placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
            spellCheck={false}
            autoFocus
            className="w-full h-11 px-4 rounded-full bg-white border border-black/10 text-[13px] text-ink-1
                       focus:outline-none focus:border-accent placeholder:text-ink-3 tabular-nums"
          />
          {error && <p className="text-[12px] text-accent px-1 whitespace-pre-line">{error}</p>}
        </div>
      </PopIn>

      <PopIn delay={0.20}>
        <PrimaryButton onClick={submit} disabled={!token.trim() || saving} className="w-full">
          {saving ? 'Salvando…' : 'Continuar'}
        </PrimaryButton>
      </PopIn>

      <PopIn delay={0.25}>
        <p className="text-[11px] text-ink-3 text-center">
          O token fica salvo só no seu computador. Nunca é enviado pra lugar nenhum além da HuggingFace.
        </p>
      </PopIn>
    </div>
  )
}

// ── Step 2: download + install progress ───────────────────────────────────────
function SetupProgress({ onComplete, onFail }) {
  const [phase, setPhase] = useState('model')
  const [label, setLabel] = useState('Iniciando…')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    const off = window.skkribe.onSetupProgress((p) => {
      if (!p) return
      if (p.phase === 'error') { setError(p.label || 'Falha desconhecida'); return }
      if (p.phase) setPhase(p.phase)
      if (p.label) setLabel(p.label)
      if (typeof p.percent === 'number') setPercent(p.percent)
    })

    ;(async () => {
      const res = await window.skkribe.runSetup()
      off()
      if (res?.ok) onComplete?.()
      else { setError(res?.error || 'Falha na configuração'); onFail?.(res?.error) }
    })()

    return () => off()
  }, [onComplete, onFail])

  const meta = PHASE_META[phase] || PHASE_META.model
  const phaseIndex = PHASE_ORDER.indexOf(phase)
  const overall = phase === 'done'
    ? 1
    : Math.max(0, Math.min(1, (Math.max(0, phaseIndex) + (percent || 0)) / PHASE_ORDER.length))

  if (error) {
    return (
      <div className="flex flex-col items-center w-full max-w-[440px] mx-auto px-6 pt-8 space-y-[22px]">
        <PopIn>
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center text-2xl">⚠️</div>
        </PopIn>
        <PopIn delay={0.05}>
          <div className="text-center space-y-1.5">
            <h1 className="text-[22px] font-bold text-ink-1">{meta.title}</h1>
            <p className="text-[13px] text-ink-2 whitespace-pre-line">{error}</p>
          </div>
        </PopIn>
        <PopIn delay={0.10}>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 rounded-full bg-accent text-white text-[13px] font-semibold"
          >
            Tentar novamente
          </button>
        </PopIn>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center w-full max-w-[440px] mx-auto px-6 pt-8 space-y-[22px]">
      <PopIn>
        <div className="relative w-16 h-16">
          <svg width="64" height="64" viewBox="0 0 64 64">
            {(() => {
              const r = 30
              const c = 2 * Math.PI * r
              const dash = c * Math.max(0.04, overall)
              return (
                <>
                  <circle cx="32" cy="32" r={r} stroke="#F0F1F3" strokeWidth="6" fill="none" />
                  <circle
                    cx="32" cy="32" r={r}
                    stroke="#DC2626" strokeWidth="6" fill="none"
                    strokeLinecap="round"
                    transform="rotate(-90 32 32)"
                    strokeDasharray={`${dash} ${c - dash}`}
                    style={{ transition: 'stroke-dasharray 400ms ease' }}
                  />
                </>
              )
            })()}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-accent" />
          </div>
        </div>
      </PopIn>

      <PopIn delay={0.05}>
        <div className="text-center space-y-1.5">
          <h1 className="text-[22px] font-bold text-ink-1">Configurando Skkribe</h1>
          <p className="text-[13px] text-ink-2">Só na primeira vez — depois fica salvo.</p>
        </div>
      </PopIn>

      <PopIn delay={0.10}>
        <div className="bg-nested rounded-nested px-4 py-4 flex flex-col gap-3 w-full">
          <div className="flex items-center gap-2 flex-wrap">
            {PHASE_ORDER.map((p, i) => {
              const done = phaseIndex > i || phase === 'done'
              const active = phaseIndex === i && phase !== 'done'
              const kind = done ? 'positive' : active ? 'critical' : 'neutral'
              return <StatusPill key={p} label={PHASE_META[p].title} kind={kind} />
            })}
          </div>

          <div className="h-1.5 w-full rounded-full bg-white overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-300"
              style={{ width: `${Math.min(100, overall * 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[12px]">
            <span className="text-ink-2 truncate flex-1 pr-2">{label}</span>
            <span className="font-semibold text-ink-1 tabular-nums">{Math.round(overall * 100)}%</span>
          </div>
        </div>
      </PopIn>

      <PopIn delay={0.15}>
        <p className="text-[11px] text-ink-3 text-center">Download total: ~2,7 GB.<br/>Tempo estimado: 5-15 min dependendo da sua conexão.</p>
      </PopIn>
    </div>
  )
}
