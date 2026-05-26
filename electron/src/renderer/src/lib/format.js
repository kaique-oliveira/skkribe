// Time formatting helpers — mirror AppState.formatElapsed and formatClock from the Mac app.

export function formatElapsed(seconds) {
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

export function formatClock(d) {
  if (!d) return '-'
  const date = d instanceof Date ? d : new Date(d)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** seg.start in seconds → "[mm:ss]". */
export function formatTimestamp(seconds) {
  const s = Math.floor(seconds || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}
