import { useEffect, useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppState, STATUS, PHASES } from './lib/state'
import { DropZone } from './views/DropZone'
import { SpeakerCount } from './views/SpeakerCount'
import { ModelLoading } from './views/ModelLoading'
import { Processing } from './views/Processing'
import { Result } from './views/Result'
import { ErrorView } from './views/ErrorView'
import { FirstRunSetup } from './views/FirstRunSetup'

export function App() {
  const s = useAppState()
  const [bootError, setBootError] = useState(null)

  // ── Boot: ask the main process whether the resources are all in place.
  // If anything's missing → switch to firstRun and let FirstRunSetup take over.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        s.setStatusMessage('Verificando configuração…')
        s.setLoadingProgress(0.5)
        const setup = await window.skribe.checkSetup()
        if (cancelled) return
        if (!setup.ready) {
          s.setStatus(STATUS.firstRun)
          return
        }
        s.setLoadingProgress(1)
        s.setStatus(STATUS.idle)
      } catch (err) {
        setBootError(err.message)
        s.setStatus(STATUS.error)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Pipeline trigger.
  const startTranscription = useCallback(async (filePath, expectedSpeakers) => {
    s.startProcessing({ filePath, monologue: expectedSpeakers === 1 })

    // Listen to progress events for the lifetime of this transcription.
    const off = window.skribe.onProgress((payload) => {
      if (payload?.phase) {
        const phase = PHASES[payload.phase]
        if (phase) s.setCurrentPhase(phase)
      }
      if (payload?.message) s.setProgressMessage(payload.message)
    })

    try {
      const { fileName, segments } = await window.skribe.transcribe(filePath, expectedSpeakers)
      s.finishProcessing({ fileName, segments })
    } catch (err) {
      const msg = err?.message || String(err)
      const friendly = msg === 'diarization_not_configured'
        ? 'Diarização não configurada. Rode: npm run setup:diarization -- --token=hf_…'
        : msg === 'whisper_not_found'
          ? 'whisper.cpp não encontrado. Rode: npm run setup:whisper'
          : msg === 'model_not_found'
            ? 'Modelo de transcrição não baixado. Rode: npm run setup:model'
            : msg
      s.failProcessing(friendly)
    } finally {
      off()
    }
  }, [s])

  // ── Render router (mirrors ContentView.swift switch).
  let content = null
  switch (s.status) {
    case STATUS.loading:
      content = <ModelLoading message={s.statusMessage} progress={s.loadingProgress} />
      break
    case STATUS.firstRun:
      content = <FirstRunSetup
        onComplete={() => s.setStatus(STATUS.idle)}
        onFail={(msg) => { setBootError(msg); s.setStatus(STATUS.error) }}
      />
      break
    case STATUS.idle:
      content = <DropZone onFileSelected={(p) => {
        s.setPendingFilePath(p)
        s.setStatus(STATUS.choosingSpeakers)
      }} />
      break
    case STATUS.choosingSpeakers:
      content = <SpeakerCount
        fileName={s.pendingFilePath?.split('/').pop() || ''}
        onConfirm={(count) => startTranscription(s.pendingFilePath, count)}
        onCancel={s.reset}
      />
      break
    case STATUS.working:
      content = <Processing
        currentPhase={s.currentPhase}
        elapsed={s.elapsed}
        startTime={s.startTime}
        progressMessage={s.progressMessage}
        isMonologue={s.isMonologue}
      />
      break
    case STATUS.done:
      content = <Result
        fileName={s.fileName}
        segments={s.segments}
        audioDuration={s.audioDuration}
        elapsed={s.elapsed}
        startTime={s.startTime}
        speakerNames={s.speakerNames}
        setSpeakerNames={s.setSpeakerNames}
        onNewTranscription={s.reset}
      />
      break
    case STATUS.error:
      content = <ErrorView message={bootError || s.errorMessage} onRetry={() => {
        setBootError(null)
        s.reset()
      }} />
      break
    default:
      content = null
  }

  return (
    <div className="w-full h-full bg-bg text-ink-1 overflow-hidden flex flex-col">
      {/* Top region acts as the macOS drag handle (hiddenInset title bar) and leaves room for traffic lights. */}
      <div className="h-7 drag-region shrink-0" />

      {/* Cross-fade between views — the per-view PopIn modifiers on individual
          elements handle the rich entrance choreography; this wrapper just
          smooths the transition. Mode='wait' avoids double-mount layout shifts. */}
      <div className="flex-1 overflow-y-auto pt-1 relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={s.status}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="h-full"
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
