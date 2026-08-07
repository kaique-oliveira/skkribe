import { useState } from 'react'
import { PopIn } from '../components/PopIn'
import { PrimaryButton } from '../components/Buttons'
import { IconFolder, IconTray } from '../components/icons'

const FORMATS = ['MP3', 'M4A', 'WAV', 'FLAC', 'MP4', 'MOV']

export function DropZone({ onFileSelected }) {
  const [dragging, setDragging] = useState(false)

  async function choose() {
    const filePath = await window.skkribe.openAudioDialog()
    if (filePath) onFileSelected(filePath)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.path) onFileSelected(file.path)
  }

  return (
    <div
      className="my-auto py-8 flex flex-col items-center w-full max-w-[480px] mx-auto px-6"
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      {/* Hero, recording-red dot */}
      <PopIn>
        <div className="pt-3 relative w-24 h-24">
          <div className="absolute inset-0 rounded-full bg-accent-light" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-accent shadow-[0_3px_12px_rgba(220,38,38,0.35)]" />
          </div>
        </div>
      </PopIn>

      {/* Title block */}
      <PopIn delay={0.05}>
        <div className="text-center mt-6 space-y-1.5">
          <h1 className="text-[24px] font-bold text-ink-1 leading-tight">Transcrever áudio ou vídeo</h1>
          <p className="text-[13px] text-ink-2">100% local. Nenhum dado sai do seu computador.</p>
        </div>
      </PopIn>

      {/* Drop area */}
      <PopIn delay={0.10}>
        <div
          className={`mt-8 w-full px-6 py-11 rounded-card-sm flex flex-col items-center gap-3 transition-colors ${
            dragging
              ? 'bg-accent-light/60 border-[1.5px] border-accent'
              : 'bg-nested border-[1.5px] border-dashed border-transparent'
          }`}
        >
          <IconTray className={`text-[36px] ${dragging ? 'text-accent' : 'text-ink-3'}`} />
          <p className={`text-[15px] font-semibold ${dragging ? 'text-accent-soft-text' : 'text-ink-2'}`}>
            {dragging ? 'Solte aqui' : 'Arraste um arquivo'}
          </p>
          <p className="text-xs text-ink-3">ou clique em escolher abaixo</p>
        </div>
      </PopIn>

      {/* CTA */}
      <PopIn delay={0.15}>
        <PrimaryButton onClick={choose} className="mt-7">
          <IconFolder className="text-base" />
          Escolher arquivo
        </PrimaryButton>
      </PopIn>

      {/* Format pills */}
      <PopIn delay={0.20}>
        <div className="mt-3.5 flex gap-1.5">
          {FORMATS.map((f) => (
            <span key={f} className="px-2 py-0.5 rounded-full bg-nested text-[10px] font-semibold text-ink-3">{f}</span>
          ))}
        </div>
      </PopIn>
    </div>
  )
}
