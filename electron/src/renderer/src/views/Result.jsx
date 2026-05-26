import { useState, useMemo } from 'react'
import { PopIn } from '../components/PopIn'
import { PrimaryButton, SecondaryButton } from '../components/Buttons'
import { StatusPill } from '../components/StatusPill'
import { SpeakerNamingSheet } from './SpeakerNaming'
import { IconRename, IconCopy, IconDownload, IconCheck, IconPlus, IconWave, IconClock } from '../components/icons'
import { formatElapsed, formatClock, formatTimestamp } from '../lib/format'

const SPEAKER_STYLES = [
  { bg: '#DBEAFE', text: '#1D4ED8' }, // info
  { bg: '#FCE7F3', text: '#9D174D' }, // secondary
  { bg: '#DCFCE7', text: '#15803D' }, // positive
  { bg: '#FEF3C7', text: '#A16207' }, // warning
  { bg: '#FEE2E2', text: '#991B1B' }, // critical
  { bg: '#F0F1F3', text: '#2A2A2C' }, // neutral
]

export function Result({
  fileName, segments, audioDuration, elapsed, startTime,
  speakerNames, setSpeakerNames, onNewTranscription,
}) {
  const [copied, setCopied] = useState(false)
  const [mdSaved, setMdSaved] = useState(false)
  const [copiedSpeaker, setCopiedSpeaker] = useState(null)
  const [naming, setNaming] = useState(false)

  const orderedSpeakers = useMemo(() => {
    const seen = []
    for (const s of segments) if (!seen.includes(s.speaker)) seen.push(s.speaker)
    return seen
  }, [segments])

  const speakerIndex = (sp) => Math.max(0, orderedSpeakers.indexOf(sp)) % SPEAKER_STYLES.length
  const displayName = (sp) => speakerNames[sp] || sp

  const wordCount = useMemo(
    () => segments.reduce((a, s) => a + (s.text || '').split(/\s+/).filter(Boolean).length, 0),
    [segments]
  )
  const speakerCount = orderedSpeakers.length

  // first-appearance index map for "Copiar fala" button
  const firstAppearance = useMemo(() => {
    const m = new Map()
    segments.forEach((s, i) => { if (!m.has(s.speaker)) m.set(s.speaker, i) })
    return m
  }, [segments])

  function copyAll() {
    const text = segments
      .map((s) => `[${formatTimestamp(s.start)}] ${displayName(s.speaker)}: ${s.text}`)
      .join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copySpeaker(speaker) {
    const lines = segments.filter((s) => s.speaker === speaker)
      .map((s) => `[${formatTimestamp(s.start)}] ${s.text}`)
    const text = [`# ${displayName(speaker)}`, '', ...lines].join('\n')
    navigator.clipboard.writeText(text)
    setCopiedSpeaker(speaker)
    setTimeout(() => setCopiedSpeaker((c) => (c === speaker ? null : c)), 2000)
  }

  async function saveMd() {
    const lines = []
    lines.push(`# ${fileName}`, '')
    if (startTime) {
      lines.push(`> **Início:** ${formatClock(startTime)}  ·  **Duração:** ${formatElapsed(elapsed)}`)
      lines.push('>')
      lines.push(`> **Participantes:** ${orderedSpeakers.map(displayName).join(', ')}`)
      lines.push('>')
      lines.push(`> **Palavras:** ${wordCount}  ·  **Pessoas:** ${speakerCount}`)
      lines.push('')
    }
    lines.push('---', '')
    let last = null
    for (const s of segments) {
      if (s.speaker !== last) {
        if (last !== null) lines.push('')
        lines.push(`### ${displayName(s.speaker)}`)
        last = s.speaker
      }
      lines.push(`\`${formatTimestamp(s.start)}\` ${s.text}`)
    }
    const base = fileName.replace(/\.[^.]+$/, '')
    const written = await window.skribe.saveMarkdown(base, lines.join('\n'))
    if (written) {
      setMdSaved(true)
      setTimeout(() => setMdSaved(false), 2000)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Fixed header */}
      <PopIn>
        <div className="px-6 pt-5 pb-4 bg-bg space-y-3.5">
          {/* row 1: title block */}
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-light flex items-center justify-center text-accent text-base shrink-0">📄</div>
            <div className="flex-1 min-w-0">
              <p className="text-[17px] font-semibold text-ink-1 truncate">{fileName}</p>
              <div className="mt-1 flex items-center gap-1.5">
                <StatusPill label={`${wordCount} palavras`} />
                <StatusPill label={`${speakerCount} ${speakerCount === 1 ? 'pessoa' : 'pessoas'}`} />
              </div>
            </div>
          </div>

          {/* row 2: action toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <SecondaryButton onClick={() => setNaming(true)}>
              <IconRename /> Renomear
            </SecondaryButton>
            <SecondaryButton onClick={copyAll}>
              {copied ? <><IconCheck /> Copiado!</> : <><IconCopy /> Copiar</>}
            </SecondaryButton>
            <SecondaryButton onClick={saveMd}>
              {mdSaved ? <><IconCheck /> Salvo!</> : <><IconDownload /> Salvar</>}
            </SecondaryButton>
            <span className="flex-1" />
            <PrimaryButton onClick={onNewTranscription}>
              <IconPlus /> Nova
            </PrimaryButton>
          </div>

          {/* row 3: meta strip */}
          <div className="rounded-nested bg-nested px-3.5 py-2.5 flex items-center gap-3 text-[11px]">
            <MetaItem icon={<IconWave />} label="Áudio" value={formatElapsed(audioDuration || segments[segments.length - 1]?.end || 0)} />
            <Divider />
            <MetaItem icon="⌛" label="Tempo" value={formatElapsed(elapsed)} />
            {startTime && (
              <>
                <Divider />
                <MetaItem icon={<IconClock />} label="Início" value={formatClock(startTime)} />
              </>
            )}
            <span className="flex-1" />
          </div>
        </div>
      </PopIn>

      <div className="border-t border-black/5" />

      {/* Scrollable transcript */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-4 pb-[88px] max-w-full">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-ink-2 text-sm">💬</span>
            <span className="text-[15px] font-semibold text-ink-1">Transcrição</span>
          </div>

          {/* Tighter rhythm inside one speaker's turn (gap-y-1.5) plus a much
              larger gap when the speaker actually changes (mt-9). The visual
              hierarchy makes it obvious where each turn starts at a glance. */}
          <div className="flex flex-col gap-1.5">
            {segments.map((seg, i) => {
              const prev = i > 0 ? segments[i - 1] : null
              const isNewSpeaker = prev?.speaker !== seg.speaker
              const style = SPEAKER_STYLES[speakerIndex(seg.speaker)]
              return (
                <div key={i} className={isNewSpeaker && i > 0 ? 'mt-9' : ''}>
                  {isNewSpeaker && (
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                        style={{ backgroundColor: style.bg, color: style.text }}
                      >
                        {displayName(seg.speaker)}
                      </span>
                      <span className="text-[11px] text-ink-3 tabular-nums">{formatTimestamp(seg.start)}</span>
                      {firstAppearance.get(seg.speaker) === i && (
                        <button
                          onClick={() => copySpeaker(seg.speaker)}
                          className="text-[11px] font-medium text-ink-2 hover:text-ink-1 flex items-center gap-1 transition-colors"
                        >
                          {copiedSpeaker === seg.speaker ? <><IconCheck /> Copiado</> : <><IconCopy /> Copiar fala</>}
                        </button>
                      )}
                    </div>
                  )}
                  <p className="text-[14px] text-ink-1 select-text leading-[1.65]">{seg.text}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {naming && (
        <SpeakerNamingSheet
          segments={segments}
          names={speakerNames}
          onSave={setSpeakerNames}
          onClose={() => setNaming(false)}
        />
      )}
    </div>
  )
}

function MetaItem({ icon, label, value }) {
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-ink-3 text-[10px]">{icon}</span>
      <span className="text-ink-3">{label}</span>
      <span className="font-semibold text-ink-1 tabular-nums text-[12px]">{value}</span>
    </span>
  )
}
function Divider() {
  return <span className="w-px h-3 bg-black/10" />
}
