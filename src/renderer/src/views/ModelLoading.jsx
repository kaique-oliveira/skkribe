import { PopIn } from '../components/PopIn'

export function ModelLoading({ message, progress = 0.2 }) {
  const r = 30, c = 2 * Math.PI * r
  const dash = c * Math.min(1, Math.max(0.08, progress))
  return (
    <div className="my-auto py-8 flex flex-col items-center w-full max-w-[440px] mx-auto px-6 space-y-[22px]">
      <PopIn>
        <div className="relative w-16 h-16">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r={r} stroke="#F0F1F3" strokeWidth="6" fill="none" />
            <circle
              cx="32" cy="32" r={r}
              stroke="#DC2626" strokeWidth="6" fill="none"
              strokeLinecap="round"
              transform="rotate(-90 32 32)"
              strokeDasharray={`${dash} ${c - dash}`}
              style={{ transition: 'stroke-dasharray 400ms ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-accent" />
          </div>
        </div>
      </PopIn>

      <PopIn delay={0.05}>
        <div className="text-center space-y-1.5">
          <h1 className="text-[22px] font-bold text-ink-1">Preparando o Skkribe</h1>
          <p className="text-[13px] text-ink-2">{message}</p>
        </div>
      </PopIn>

      <PopIn delay={0.10}>
        <div className="bg-nested rounded-nested px-4 py-4 flex flex-col items-center gap-2 w-full">
          <div className="h-1.5 w-full rounded-full bg-white overflow-hidden">
            <div className="h-full bg-accent rounded-full transition-[width] duration-300" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </div>
          <span className="text-[12px] font-semibold text-ink-2 tabular-nums">{Math.round(progress * 100)}%</span>
        </div>
      </PopIn>

      <PopIn delay={0.15}>
        <p className="text-[11px] text-ink-3">Só na primeira vez. Depois fica salvo.</p>
      </PopIn>
    </div>
  )
}
