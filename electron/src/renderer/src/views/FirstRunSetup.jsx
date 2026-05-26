import { useEffect, useState } from 'react'
import { PopIn } from '../components/PopIn'
import { StatusPill } from '../components/StatusPill'

// First-launch auto-setup: downloads the whisper model (~1 GB), creates the
// Python venv, installs torch + pyannote, and pre-caches the diarization
// weights. Runs unattended — the user just sees progress and waits.
//
// Phases mirror runtime-setup.js → emit({ phase, label, percent }).
const PHASE_META = {
  model:   { title: 'Modelo de transcrição',     hint: 'Baixando o melhor modelo (large-v3, ~1 GB).' },
  venv:    { title: 'Ambiente Python',           hint: 'Criando ambiente isolado e instalando pyannote.audio + PyTorch.' },
  weights: { title: 'Pesos de identificação',    hint: 'Baixando o modelo que reconhece quem está falando.' },
  done:    { title: 'Pronto!',                   hint: 'Configuração concluída.' },
  error:   { title: 'Erro na configuração',      hint: '' },
}

const PHASE_ORDER = ['model', 'venv', 'weights']

export function FirstRunSetup({ onComplete, onFail }) {
  const [phase, setPhase] = useState('model')
  const [label, setLabel] = useState('Iniciando…')
  const [percent, setPercent] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    const off = window.skribe.onSetupProgress((p) => {
      if (!p) return
      if (p.phase === 'error') {
        setError(p.label || 'Falha desconhecida')
        return
      }
      if (p.phase) setPhase(p.phase)
      if (p.label) setLabel(p.label)
      if (typeof p.percent === 'number') setPercent(p.percent)
    })

    ;(async () => {
      const res = await window.skribe.runSetup()
      off()
      if (res?.ok) onComplete?.()
      else { setError(res?.error || 'Falha na configuração'); onFail?.(res?.error) }
    })()

    return () => off()
  }, [onComplete, onFail])

  const meta = PHASE_META[phase] || PHASE_META.model
  const phaseIndex = PHASE_ORDER.indexOf(phase)
  // Overall progress: each phase weighted equally; current phase contributes its own percent.
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
          <h1 className="text-[22px] font-bold text-ink-1">Configurando Skribe</h1>
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
              return (
                <StatusPill
                  key={p}
                  label={PHASE_META[p].title}
                  kind={kind}
                />
              )
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
