// Semantic status chip — pill background + tonal text + optional icon on the left.
// Mirrors Views/Components/StatusPill.swift kinds: positive | critical | warning |
// info | secondary | neutral.

const KIND_STYLES = {
  positive:  { bg: 'bg-positive-pill',  text: 'text-positive-text' },
  critical:  { bg: 'bg-accent-light',   text: 'text-accent-soft-text' },
  warning:   { bg: 'bg-warning-pill',   text: 'text-warning-text' },
  info:      { bg: 'bg-info-pill',      text: 'text-info-text' },
  secondary: { bg: 'bg-secondary-pill', text: 'text-secondary-text' },
  neutral:   { bg: 'bg-nested',         text: 'text-ink-2' },
}

export function StatusPill({ label, icon, kind = 'neutral' }) {
  const s = KIND_STYLES[kind] || KIND_STYLES.neutral
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.bg} ${s.text}`}>
      {icon && <span aria-hidden className="-ml-0.5">{icon}</span>}
      {label}
    </span>
  )
}

/** Filled icon badge — used for prominent status markers (record dot, error). */
export function IconBadge({ children, fill = '#DC2626', size = 28 }) {
  return (
    <div
      className="flex items-center justify-center rounded-full text-white"
      style={{ width: size, height: size, backgroundColor: fill }}
    >
      {children}
    </div>
  )
}

/** Pulsing red dot — the recording-app affordance. */
export function RecordDot({ size = 10 }) {
  return (
    <span className="relative inline-flex">
      <span
        className="rounded-full bg-accent"
        style={{ width: size, height: size }}
      />
      <span
        className="absolute inset-0 rounded-full bg-accent animate-ping opacity-50"
        style={{ width: size, height: size }}
      />
    </span>
  )
}
