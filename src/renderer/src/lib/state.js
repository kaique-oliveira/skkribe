// Single-source app state — analog of Models/AppState.swift.
//
// State machine:
//   loading → firstRun? → idle
//              ↓
//          choosingSpeakers
//              ↓
//           working → done   → idle (Nova)
//              ↓     → error → idle (Tentar de novo)

import { useEffect, useState, useCallback } from 'react'

export const STATUS = Object.freeze({
  loading: 'loading',
  firstRun: 'firstRun',
  idle: 'idle',
  choosingSpeakers: 'choosingSpeakers',
  working: 'working',
  done: 'done',
  error: 'error',
})

export const PHASES = Object.freeze({
  preparing: { rawValue: 0, label: 'Preparando o áudio', short: 'Preparar',  detail: 'Convertendo para o formato ideal…' },
  transcribing: { rawValue: 1, label: 'Transcrevendo',      short: 'Transcrição', detail: 'Identificando cada palavra do áudio…' },
  diarizing:   { rawValue: 2, label: 'Reconhecendo as vozes', short: 'Vozes',    detail: 'Descobrindo quem está falando em cada trecho…' },
  merging:     { rawValue: 3, label: 'Finalizando',         short: 'Final',    detail: 'Juntando as falas com cada pessoa…' },
})

export function useAppState() {
  const [status, setStatus] = useState(STATUS.loading)
  const [statusMessage, setStatusMessage] = useState('Iniciando…')
  const [loadingProgress, setLoadingProgress] = useState(0)

  const [pendingFilePath, setPendingFilePath] = useState(null)
  const [progressMessage, setProgressMessage] = useState('')
  const [currentPhase, setCurrentPhase] = useState(PHASES.preparing)

  const [fileName, setFileName] = useState('')
  const [segments, setSegments] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [isMonologue, setIsMonologue] = useState(false)

  const [audioDuration, setAudioDuration] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [endTime, setEndTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const [speakerNames, setSpeakerNames] = useState({})

  // Wall-clock timer — running while status==='working'.
  useEffect(() => {
    if (status !== STATUS.working) return
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  const startProcessing = useCallback(({ filePath, monologue }) => {
    setIsMonologue(!!monologue)
    setFileName(filePath.split('/').pop())
    setSegments([])
    setProgressMessage('')
    setElapsed(0)
    setStartTime(new Date())
    setEndTime(null)
    setCurrentPhase(PHASES.preparing)
    setStatus(STATUS.working)
  }, [])

  const finishProcessing = useCallback(({ segments, fileName }) => {
    setSegments(segments)
    setFileName(fileName)
    setEndTime(new Date())
    setStatus(STATUS.done)
  }, [])

  const failProcessing = useCallback((message) => {
    setEndTime(new Date())
    setErrorMessage(message)
    setStatus(STATUS.error)
  }, [])

  const reset = useCallback(() => {
    setStatus(STATUS.idle)
    setSegments([])
    setFileName('')
    setProgressMessage('')
    setElapsed(0)
    setStartTime(null)
    setEndTime(null)
    setAudioDuration(0)
    setSpeakerNames({})
    setIsMonologue(false)
  }, [])

  return {
    // status
    status, setStatus,
    statusMessage, setStatusMessage,
    loadingProgress, setLoadingProgress,

    // pipeline
    pendingFilePath, setPendingFilePath,
    progressMessage, setProgressMessage,
    currentPhase, setCurrentPhase,

    // result
    fileName, setFileName,
    segments, setSegments,
    errorMessage,
    isMonologue, setIsMonologue,

    // timing
    audioDuration, setAudioDuration,
    startTime, endTime, elapsed,

    // user-tweakable
    speakerNames, setSpeakerNames,

    // actions
    startProcessing, finishProcessing, failProcessing, reset,
  }
}
