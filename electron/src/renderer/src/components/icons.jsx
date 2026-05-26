// Inline SVG icons — small surface chosen to match the symbols the Swift app uses.
// Heroicons-outline-ish style at 1.75px stroke. Sized via wrapping element.

const W = (props) => ({ width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', ...props })

export const IconFolder = (p) => (
  <svg {...W(p)}><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2H19.5A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5v-11Z" /></svg>
)
export const IconTray = (p) => (
  <svg {...W(p)}><path d="M3 13v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5M3 13l3-6h12l3 6M3 13h5l1 2h6l1-2h5" /></svg>
)
export const IconGear = (p) => (
  <svg {...W(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
)
export const IconX = (p) => (
  <svg {...W(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>
)
export const IconCheck = (p) => (
  <svg {...W(p)}><path d="M5 12l5 5L20 7" /></svg>
)
export const IconPlus = (p) => (
  <svg {...W(p)}><path d="M12 5v14M5 12h14" /></svg>
)
export const IconClock = (p) => (
  <svg {...W(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const IconWave = (p) => (
  <svg {...W(p)}><path d="M3 12h2M19 12h2M7 6v12M11 3v18M15 6v12" /></svg>
)
export const IconCopy = (p) => (
  <svg {...W(p)}><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
)
export const IconDownload = (p) => (
  <svg {...W(p)}><path d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16" /></svg>
)
export const IconExclamation = (p) => (
  <svg {...W(p)}><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>
)
export const IconUsersTwo = (p) => (
  <svg {...W(p)}><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M19 20a5 5 0 0 0-2-4" /></svg>
)
export const IconUserOne = (p) => (
  <svg {...W(p)}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
)
export const IconUsersThree = (p) => (
  <svg {...W(p)}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20a6 6 0 0 1 12 0M14 20a5 5 0 0 1 7 0" /></svg>
)
export const IconSparkles = (p) => (
  <svg {...W(p)}><path d="M12 3v4M12 17v4M5 10l3 1 1 3-1 3-3 1M19 10l-3 1-1 3 1 3 3 1" /></svg>
)
export const IconArrowRight = (p) => (
  <svg {...W(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
)
export const IconArrowReload = (p) => (
  <svg {...W(p)}><path d="M3 12a9 9 0 0 1 15.4-6.4L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.4 6.4L3 16M3 21v-5h5" /></svg>
)
export const IconRename = (p) => (
  <svg {...W(p)}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h4M7 13h4M14 9v6" /></svg>
)
export const IconChat = (p) => (
  <svg {...W(p)}><path d="M21 12a8 8 0 0 1-12 7l-5 1 1-4A8 8 0 1 1 21 12Z" /></svg>
)
export const IconPersonWave = (p) => (
  <svg {...W(p)}><circle cx="10" cy="8" r="3" /><path d="M4 20a6 6 0 0 1 12 0M17 7a4 4 0 0 1 0 6M20 5a7 7 0 0 1 0 10" /></svg>
)
export const IconHeadphones = (p) => (
  <svg {...W(p)}><path d="M3 18v-6a9 9 0 0 1 18 0v6M3 18a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2v2ZM21 18a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2v2Z" /></svg>
)
