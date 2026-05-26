import { PopIn } from '../components/PopIn'
import { PHASES } from '../lib/state'
import { formatElapsed, formatClock } from '../lib/format'
import { IconWave, IconChat, IconPersonWave, IconCheck } from '../components/icons'

const PHASE_ICON = {
  preparing:    <IconWave />,
  transcribing: <IconChat />,
  diarizing:    <IconPersonWave />,
  merging:      <IconCheck />,
}

export function Processing({ currentPhase, elapsed, startTime, progressMessage, isMonologue }) {
  const allPhaseKeys = Object.keys(PHASES)
  const visiblePhases = isMonologue ? allPhaseKeys.filter(k => k !== 'diarizing') : allPhaseKeys

  return (
    <div className="flex flex-col items-center w-full max-w-[520px] mx-auto px-6 pt-6 space-y-[22px]">
      <PopIn>
        <div className="relative w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-accent-light" />
          <div className="absolute inset-0 flex items-center justify-center text-accent text-[30px]">
            {PHASE_ICON[currentPhaseKey(currentPhase)]}
          </div>
        </div>
      </PopIn>

      <PopIn delay={0.05}>
        <div className="text-center space-y-1.5">
          <h1 className="text-[22px] font-bold text-ink-1">{currentPhase.label}</h1>
          <p className="text-[13px] text-ink-2">{currentPhase.detail}</p>
        </div>
      </PopIn>

      <PopIn delay={0.10}>
        <div className="flex items-center gap-2">
          {visiblePhases.map((key, i) => {
            const p = PHASES[key]
            const state = p.rawValue < currentPhase.rawValue ? 'done'
                        : p.rawValue === currentPhase.rawValue ? 'active'
                        : 'pending'
            const stylesByState = {
              done:    'bg-positive-pill text-positive-text',
              active:  'bg-accent-light text-accent-soft-text',
              pending: 'bg-nested text-ink-3',
            }
            const dotByState = {
              done:    <span className="text-[9px]">✓</span>,
              active:  <span className="w-1.5 h-1.5 rounded-full bg-accent" />,
              pending: <span className="w-1.5 h-1.5 rounded-full border border-ink-3" />,
            }
            const connectorColor = p.rawValue < currentPhase.rawValue
              ? 'bg-positive-fill/45'
              : 'bg-black/[0.08]'
            return (
              <span key={key} className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${stylesByState[state]}`}>
                  {dotByState[state]}
                  {p.short}
                </span>
                {i < visiblePhases.length - 1 && <span className={`block w-3 h-[1.5px] ${connectorColor}`} />}
              </span>
            )
          })}
        </div>
      </PopIn>

      <PopIn delay={0.15}>
        <div className="w-[280px] h-7 rounded-full bg-nested flex items-center justify-center gap-1.5 text-[11px]">
          <span className="text-ink-2 font-semibold">⏱</span>
          <span className="font-semibold text-ink-1 tabular-nums text-[12px]">{formatElapsed(elapsed)}</span>
          {startTime && (
            <>
              <span className="text-ink-3">·</span>
              <span className="text-ink-3 tabular-nums">desde {formatClock(startTime)}</span>
            </>
          )}
        </div>
      </PopIn>

      {progressMessage && (
        <p className="text-[11px] text-ink-3 text-center max-w-[360px] line-clamp-2">{progressMessage}</p>
      )}
    </div>
  )
}

function currentPhaseKey(phase) {
  return Object.keys(PHASES).find((k) => PHASES[k].rawValue === phase.rawValue) || 'preparing'
}
