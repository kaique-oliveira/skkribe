import { useState } from 'react'
import { PopIn } from '../components/PopIn'
import { LinkButton } from '../components/Buttons'
import { IconArrowRight, IconPersonWave, IconUserOne, IconUsersTwo, IconUsersThree, IconSparkles } from '../components/icons'

// Each option becomes a HARD speaker-count constraint passed to pyannote
// (except "Não sei", which lets it auto-detect). We learned the hard way that
// soft hints like `min_speakers=N` let pyannote drift to N+1 phantoms, exact
// counts produce consistently better results.
const OPTIONS = [
  { count: null, title: 'Não sei',  subtitle: 'Deixa a IA detectar automaticamente',     icon: <IconSparkles />,   tint: '#6B6B70' },
  { count: 1,    title: '1 pessoa', subtitle: 'Monólogo, áudio de uma pessoa só',        icon: <IconUserOne />,    tint: '#3B82F6' },
  { count: 2,    title: '2 pessoas', subtitle: 'Conversa entre duas pessoas',            icon: <IconUsersTwo />,   tint: '#EC4899' },
  { count: 3,    title: '3 pessoas', subtitle: 'Reunião pequena com 3 falantes exatos',  icon: <IconUsersThree />, tint: '#F59E0B' },
]

// Whisper model modes (see MODEL_MODES in main/index.js). `balanced` ships
// with the app; the other two are downloaded once, on first use.
const MODES = [
  { key: 'fast',     label: 'Rápido',   hint: 'turbo · ótimo na maioria dos áudios' },
  { key: 'balanced', label: 'Padrão',   hint: 'large-v3 · melhor equilíbrio' },
  { key: 'max',      label: 'Máximo',   hint: 'large-v3 completo · baixa 3 GB' },
]
const MODE_STORAGE_KEY = 'skkribe.modelMode'

export function SpeakerCount({ fileName, onConfirm, onCancel }) {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(MODE_STORAGE_KEY)
    return MODES.some((m) => m.key === saved) ? saved : 'balanced'
  })
  const pickMode = (key) => {
    setMode(key)
    localStorage.setItem(MODE_STORAGE_KEY, key)
  }

  return (
    <div className="my-auto py-8 flex flex-col items-center w-full max-w-[480px] mx-auto px-6">
      <PopIn>
        <div className="pt-3 relative w-[76px] h-[76px]">
          <div className="absolute inset-0 rounded-full bg-accent-light" />
          <div className="absolute inset-0 flex items-center justify-center text-accent text-[28px]">
            <IconPersonWave />
          </div>
        </div>
      </PopIn>

      <PopIn delay={0.05}>
        <div className="text-center mt-[18px] space-y-1.5 px-2">
          <h1 className="text-[22px] font-bold text-ink-1 leading-tight">Quantas pessoas falam?</h1>
          <p className="text-[13px] text-ink-2">Ajuda o Skkribe a separar melhor as vozes. Se não souber, deixa no automático.</p>
        </div>
      </PopIn>

      <PopIn delay={0.10}>
        <div className="mt-4 px-3 py-1.5 rounded-full bg-nested flex items-center gap-1.5 max-w-full">
          <span className="text-ink-3 text-[11px] font-semibold">♬</span>
          <span className="text-[12px] font-medium text-ink-2 truncate">{fileName}</span>
        </div>
      </PopIn>

      <PopIn delay={0.14}>
        <div className="mt-5 w-full">
          <div className="flex rounded-full bg-nested p-1 gap-1">
            {MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => pickMode(m.key)}
                title={m.hint}
                className={`flex-1 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${
                  mode === m.key ? 'bg-white text-ink-1 shadow-sm' : 'text-ink-2 hover:text-ink-1'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-center text-[11px] text-ink-3">
            {MODES.find((m) => m.key === mode)?.hint}
          </p>
        </div>
      </PopIn>

      <div className="mt-4 w-full space-y-2">
        {OPTIONS.map((opt, idx) => (
          <PopIn key={opt.title} delay={0.18 + idx * 0.06}>
            <button
              onClick={() => onConfirm(opt.count, mode)}
              className="w-full flex items-center gap-3.5 p-3.5 rounded-nested bg-nested hover:bg-hover transition-colors text-left"
            >
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-base"
                style={{ backgroundColor: `${opt.tint}1f`, color: opt.tint }}
              >
                {opt.icon}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[14px] font-semibold text-ink-1">{opt.title}</span>
                <span className="block text-[11px] text-ink-2 truncate">{opt.subtitle}</span>
              </span>
              <span className="text-ink-3 text-[11px]"><IconArrowRight /></span>
            </button>
          </PopIn>
        ))}
      </div>

      <PopIn delay={0.44}>
        <LinkButton onClick={onCancel} className="mt-[18px]">Cancelar</LinkButton>
      </PopIn>
    </div>
  )
}
