import { useState, useEffect } from 'react'
import { SecondaryButton, PrimaryButton, IconButton } from '../components/Buttons'
import { IconX, IconCheck, IconRename } from '../components/icons'

const STYLES = [
  { bg: '#DBEAFE', text: '#1D4ED8' }, // info
  { bg: '#FCE7F3', text: '#9D174D' }, // secondary
  { bg: '#DCFCE7', text: '#15803D' }, // positive
  { bg: '#FEF3C7', text: '#A16207' }, // warning
  { bg: '#FEE2E2', text: '#991B1B' }, // critical
  { bg: '#F0F1F3', text: '#2A2A2C' }, // neutral
]

export function SpeakerNamingSheet({ segments, names, onSave, onClose }) {
  const orderedSpeakers = []
  for (const s of segments) if (!orderedSpeakers.includes(s.speaker)) orderedSpeakers.push(s.speaker)

  const [local, setLocal] = useState(() => ({ ...names }))
  useEffect(() => { setLocal({ ...names }) }, [names])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-6">
      <div className="bg-bg rounded-card-sm shadow-floating w-[440px] max-w-full h-[480px] flex flex-col overflow-hidden">
        {/* header */}
        <div className="bg-white px-5 py-3.5 flex items-center gap-2 border-b border-black/5">
          <span className="text-ink-2"><IconRename /></span>
          <span className="text-[15px] font-semibold text-ink-1">Renomear participantes</span>
          <span className="ml-auto"><IconButton onClick={onClose}><IconX /></IconButton></span>
        </div>

        {/* rows */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-2.5">
          {orderedSpeakers.map((speaker, i) => {
            const style = STYLES[i % STYLES.length]
            return (
              <div key={speaker} className="p-3.5 bg-nested rounded-nested space-y-2">
                <span
                  className="inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{ backgroundColor: style.bg, color: style.text }}
                >
                  {speaker}
                </span>
                <input
                  type="text"
                  placeholder="Nome (ex: João, Maria)"
                  className="w-full h-10 px-3 rounded-input bg-white text-[14px] text-ink-1 outline-none border border-black/10 focus:border-accent transition-colors"
                  value={local[speaker] || ''}
                  onChange={(e) => setLocal({ ...local, [speaker]: e.target.value })}
                />
              </div>
            )
          })}
        </div>

        {/* footer */}
        <div className="bg-white px-5 py-3.5 flex items-center justify-end gap-2.5 border-t border-black/5">
          <SecondaryButton onClick={onClose}>Cancelar</SecondaryButton>
          <PrimaryButton onClick={() => { onSave(local); onClose() }}>
            <IconCheck /> Salvar nomes
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
