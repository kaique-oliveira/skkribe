import { useState, useRef, useCallback, useEffect } from 'react'
import styles from './styles/App.module.css'

const STATUS = {
  IDLE: 'idle',
  WORKING: 'working',
  DONE: 'done',
  SETUP_DIARIZATION: 'setup_diarization',
  SETTINGS: 'settings',
  ERROR: 'error',
}

const MODEL_LABELS = {
  tiny:              { label: 'Tiny',           desc: '~32 MB · Ultra rápido · Qualidade básica' },
  base:              { label: 'Base',           desc: '~60 MB · Muito rápido · Qualidade boa' },
  small:             { label: 'Small',          desc: '~190 MB · Rápido · Qualidade muito boa ✓ Recomendado' },
  medium:            { label: 'Medium',         desc: '~539 MB · Moderado · Qualidade excelente' },
  'large-v3':        { label: 'Large v3',       desc: '~1.1 GB · Lento · Qualidade máxima' },
  'large-v3-turbo':  { label: 'Large v3 Turbo', desc: '~574 MB · Mais rápido que Large · Qualidade excelente' },
}

const PHASES = [
  { id: 'convert',    label: 'Preparando o áudio',      detail: 'Convertendo para o formato ideal…',             icon: '🎧', match: ['convert', 'ffmpeg', 'wav'] },
  { id: 'transcribe', label: 'Ouvindo com atenção',      detail: 'Identificando cada palavra do áudio…',          icon: '✍️', match: ['whisper', 'transcri', 'segment', 'progress'] },
  { id: 'voices',     label: 'Reconhecendo as vozes',    detail: 'Descobrindo quem está falando em cada trecho…', icon: '🎙️', match: ['pyannote', 'voz', 'analis', 'modelo', 'pipeline', 'mps', 'cpu', 'diarize', 'speaker'] },
  { id: 'combine',    label: 'Juntando tudo',            detail: 'Associando as falas com cada pessoa…',          icon: '🧩', match: ['cruzando', 'combinando', 'falas', 'total', 'pronto'] },
]

function getPhase(rawLog) {
  const log = rawLog.toLowerCase()
  for (let i = PHASES.length - 1; i >= 0; i--) {
    if (PHASES[i].match.some((kw) => log.includes(kw))) return PHASES[i]
  }
  return PHASES[0]
}

function fmt(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0')
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function fmtElapsed(sec) {
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s > 0 ? `${m}m ${s}s` : `${m}m`
}

function fmtClock(date) {
  if (!date) return '—'
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Cores sutis de fundo para cada falante (dark theme friendly)
const SPEAKER_BG_COLORS = [
  'rgba(124, 106, 247, 0.07)',
  'rgba(247, 106, 106, 0.06)',
  'rgba(106, 247, 160, 0.06)',
  'rgba(247, 197, 106, 0.06)',
  'rgba(106, 200, 247, 0.06)',
  'rgba(247, 106, 200, 0.06)',
]
const SPEAKER_COLORS = ['#7c6af7', '#f76a6a', '#6af7a0', '#f7c56a', '#6ac8f7', '#f76ac8']

export default function App() {
  const [status, setStatus]               = useState(STATUS.IDLE)
  const [fileName, setFileName]           = useState('')
  const [segments, setSegments]           = useState([])
  const [rawLog, setRawLog]               = useState('')
  const [error, setError]                 = useState('')
  const [dragging, setDragging]           = useState(false)
  const [hfToken, setHfToken]             = useState('')
  const [currentPhase, setCurrentPhase]   = useState(PHASES[0])
  const [phaseIndex, setPhaseIndex]       = useState(0)

  // Performance
  const [perfCfg, setPerfCfg]             = useState(null)
  const [perfSaved, setPerfSaved]         = useState(false)

  // Tempo
  const [elapsed, setElapsed]       = useState(0)
  const [startTime, setStartTime]   = useState(null)
  const [endTime, setEndTime]       = useState(null)
  const [totalTime, setTotalTime]   = useState(null)
  const timerRef = useRef(null)

  const removeListenerRef = useRef(null)
  const speakerColorMap   = useRef({})
  const speakerBgMap      = useRef({})
  const colorCounter      = useRef(0)

  useEffect(() => {
    window.api.getPerfConfig().then((cfg) => setPerfCfg(cfg))
  }, [])

  // Timer de contagem
  useEffect(() => {
    if (status === STATUS.WORKING) {
      const now = new Date()
      setStartTime(now)
      setEndTime(null)
      setTotalTime(null)
      setElapsed(0)
      timerRef.current = setInterval(() => {
        setElapsed((e) => e + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (status === STATUS.DONE || status === STATUS.ERROR) {
        const now = new Date()
        setEndTime(now)
        setElapsed((e) => { setTotalTime(e); return e })
      }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  const getSpeakerColor = (speaker) => {
    if (!speakerColorMap.current[speaker]) {
      const idx = colorCounter.current % SPEAKER_COLORS.length
      speakerColorMap.current[speaker] = SPEAKER_COLORS[idx]
      speakerBgMap.current[speaker]    = SPEAKER_BG_COLORS[idx]
      colorCounter.current++
    }
    return { color: speakerColorMap.current[speaker], bg: speakerBgMap.current[speaker] }
  }

  const startTranscription = useCallback(async (fp) => {
    setStatus(STATUS.WORKING)
    setSegments([])
    setRawLog('')
    setError('')
    setCurrentPhase(PHASES[0])
    setPhaseIndex(0)
    speakerColorMap.current = {}
    speakerBgMap.current    = {}
    colorCounter.current    = 0

    if (removeListenerRef.current) removeListenerRef.current()
    removeListenerRef.current = window.api.onProgress((chunk) => {
      setRawLog((prev) => {
        const updated = prev + chunk
        const phase = getPhase(updated)
        setCurrentPhase(phase)
        setPhaseIndex(PHASES.findIndex((p) => p.id === phase.id))
        return updated
      })
    })

    try {
      const result = await window.api.transcribeFile(fp)
      setFileName(result.fileName)
      setSegments(result.segments || [])
      setStatus(STATUS.DONE)
    } catch (err) {
      const msg = err.message || String(err)
      if (msg.includes('diarization_not_configured'))
        setStatus(STATUS.SETUP_DIARIZATION)
      else if (msg.includes('whisper_not_found'))
        setError('O motor de transcrição não foi encontrado. Execute npm run setup:whisper no terminal.')
      else if (msg.includes('model_not_found'))
        setError('O modelo de IA não foi encontrado. Execute npm run setup:whisper no terminal.')
      else if (msg.includes('ffmpeg'))
        setError('O ffmpeg não foi encontrado. Instale com: brew install ffmpeg')
      else
        setError(msg)
      if (!msg.includes('diarization_not_configured'))
        setStatus(STATUS.ERROR)
    } finally {
      if (removeListenerRef.current) { removeListenerRef.current(); removeListenerRef.current = null }
    }
  }, [])

  // ── Exportar como Markdown ──────────────────────────────────────────────
  const handleExportMd = useCallback(async () => {
    const lines = []
    lines.push(`# ${fileName}`)
    lines.push('')
    if (startTime && endTime) {
      lines.push(`> **Início:** ${fmtClock(startTime)}  ·  **Fim:** ${fmtClock(endTime)}  ·  **Duração:** ${fmtElapsed(totalTime ?? elapsed)}`)
      lines.push('')
    }
    lines.push('---')
    lines.push('')

    let lastSpeaker = null
    for (const seg of segments) {
      if (seg.speaker !== lastSpeaker) {
        if (lastSpeaker !== null) lines.push('')
        lines.push(`### ${seg.speaker}`)
        lastSpeaker = seg.speaker
      }
      lines.push(`\`${fmt(seg.start)}\` ${seg.text}`)
      lines.push('')
    }

    const content = lines.join('\n')
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const savePath = await window.api.saveMdFile(baseName, content)
    if (savePath) {
      // feedback sutil — flash no botão via estado
      setMdSaved(true)
      setTimeout(() => setMdSaved(false), 2000)
    }
  }, [segments, fileName, startTime, endTime, totalTime, elapsed])

  const [mdSaved, setMdSaved] = useState(false)

  const handleSetupToken = useCallback(() => {
    if (!hfToken.trim()) return
    const cmd = `npm run setup:diarization -- --token=${hfToken.trim()}`
    navigator.clipboard.writeText(cmd)
    alert(`Comando copiado!\n\nCole no terminal dentro da pasta do projeto:\n\n${cmd}`)
  }, [hfToken])

  const handleChooseFile = async () => {
    const fp = await window.api.openFileDialog()
    if (fp) startTranscription(fp)
  }

  const handleDragOver  = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)
  const handleDrop      = (e) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) startTranscription(file.path)
  }

  const handleCopy = () => {
    const text = segments.map(s => `[${fmt(s.start)}] ${s.speaker}: ${s.text}`).join('\n\n')
    navigator.clipboard.writeText(text)
  }

  const handleNew = () => {
    setStatus(STATUS.IDLE)
    setSegments([])
    setFileName('')
    setRawLog('')
    setError('')
    setElapsed(0)
    setStartTime(null)
    setEndTime(null)
    setTotalTime(null)
  }

  const handleSavePerfCfg = useCallback(async () => {
    await window.api.savePerfConfig(perfCfg)
    setPerfSaved(true)
    setTimeout(() => setPerfSaved(false), 2000)
  }, [perfCfg])

  const prevStatus = useRef(STATUS.IDLE)
  const handleOpenSettings = () => {
    prevStatus.current = status
    setStatus(STATUS.SETTINGS)
  }
  const handleCloseSettings = () => {
    setStatus(prevStatus.current)
  }

  const wordCount = segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0)

  const isWorking = status === STATUS.WORKING
  const isDone    = status === STATUS.DONE

  return (
    <div className={styles.root}>
      <div className={styles.titlebar}>
        <span className={styles.titlebarText}>Skribe</span>
        {status !== STATUS.WORKING && (
          <button
            className={styles.titlebarSettings}
            onClick={status === STATUS.SETTINGS ? handleCloseSettings : handleOpenSettings}
            title="Configurações de performance"
          >
            {status === STATUS.SETTINGS ? '✕' : '⚙️'}
          </button>
        )}
      </div>

      <div className={styles.content}>

        {/* ── TELA INICIAL ── */}
        {status === STATUS.IDLE && (
          <div
            className={`${styles.dropzone} ${dragging ? styles.dropzoneDragging : ''}`}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          >
            <div className={styles.dropzoneIcon}>🎙️</div>
            <p className={styles.dropzoneTitle}>Solte o áudio aqui</p>
            <p className={styles.dropzoneSubtitle}>MP3 · M4A · WAV · OGG · FLAC · AAC</p>
            <button className={styles.btnPrimary} onClick={handleChooseFile}>Escolher arquivo</button>
          </div>
        )}

        {/* ── PROCESSANDO ── */}
        {isWorking && (
          <div className={styles.loadingWrapper}>
            <div className={styles.phaseIcon}>{currentPhase.icon}</div>
            <p className={styles.phaseLabel}>{currentPhase.label}</p>
            <p className={styles.phaseDetail}>{currentPhase.detail}</p>

            <div className={styles.stepsRow}>
              {PHASES.map((p, i) => (
                <div
                  key={p.id}
                  className={`${styles.step} ${
                    i < phaseIndex  ? styles.stepDone
                    : i === phaseIndex ? styles.stepActive
                    : styles.stepPending
                  }`}
                >
                  <div className={styles.stepDot} />
                  <span className={styles.stepName}>{p.label}</span>
                </div>
              ))}
            </div>

            <div className={styles.timerBadge}>
              ⏱ {fmtElapsed(elapsed)}
              {startTime && (
                <span style={{ opacity: 0.55, fontSize: '11px', fontWeight: 400 }}>
                  · desde {fmtClock(startTime)}
                </span>
              )}
            </div>

            <p className={styles.loadingNote}>Transcrição + identificação de vozes em andamento</p>
          </div>
        )}

        {/* ── SETUP DIARIZAÇÃO ── */}
        {status === STATUS.SETUP_DIARIZATION && (
          <div className={styles.setupWrapper}>
            <div className={styles.setupIcon}>🧬</div>
            <p className={styles.setupTitle}>Identificação de vozes</p>
            <p className={styles.setupDesc}>
              Para saber quem está falando em cada trecho, o Skribe usa um modelo de IA
              gratuito do HuggingFace. Você só precisa configurar uma vez.
            </p>
            <ol className={styles.setupSteps}>
              <li>Crie uma conta gratuita em <strong>huggingface.co</strong></li>
              <li>Gere um token em <strong>huggingface.co/settings/tokens</strong></li>
              <li>Aceite os termos em <strong>huggingface.co/pyannote/speaker-diarization-3.1</strong></li>
              <li>Cole o token abaixo e clique em copiar</li>
            </ol>
            <input
              className={styles.tokenInput}
              type="password"
              placeholder="hf_xxxxxxxxxxxxxxxxxxxx"
              value={hfToken}
              onChange={(e) => setHfToken(e.target.value)}
            />
            <div className={styles.setupActions}>
              <button className={styles.btnPrimary} onClick={handleSetupToken} disabled={!hfToken.trim()}>
                Copiar comando de instalação
              </button>
            </div>
            <p className={styles.setupHint}>
              Cole o comando no terminal, dentro da pasta do projeto, e reinicie o Skribe. Só precisa fazer isso uma vez.
            </p>
          </div>
        )}

        {/* ── RESULTADO ── */}
        {isDone && (
          <div className={styles.resultWrapper}>
            <div className={styles.resultHeader}>
              <div>
                <p className={styles.resultFile}>📄 {fileName}</p>
                <p className={styles.resultWordCount}>{wordCount} palavras transcritas</p>
              </div>
              <div className={styles.resultActions}>
                <button className={styles.btnSecondary} onClick={handleCopy}>Copiar texto</button>
                <button
                  className={`${styles.btnSecondary} ${mdSaved ? styles.btnSaved : ''}`}
                  onClick={handleExportMd}
                >
                  {mdSaved ? '✓ Salvo!' : 'Salvar .md'}
                </button>
                <button className={styles.btnSecondary} onClick={handleNew}>Nova transcrição</button>
              </div>
            </div>

            {/* Resumo de tempo */}
            {startTime && (
              <div className={styles.timingBar}>
                <span>🕐 Início: <strong>{fmtClock(startTime)}</strong></span>
                <span className={styles.timingDot}>·</span>
                <span>Fim: <strong>{fmtClock(endTime)}</strong></span>
                <span className={styles.timingDot}>·</span>
                <span>Duração: <strong>{fmtElapsed(totalTime ?? elapsed)}</strong></span>
              </div>
            )}

            <div className={styles.transcriptBox}>
              <div className={styles.diarization}>
                {segments.map((seg, i) => {
                  const { color, bg } = getSpeakerColor(seg.speaker)
                  const prev = segments[i - 1]
                  const showHeader = !prev || prev.speaker !== seg.speaker
                  return (
                    <div
                      key={i}
                      className={styles.diarBlock}
                      style={{ '--speaker-bg': bg }}
                    >
                      {showHeader && (
                        <div className={styles.diarHeader}>
                          <span
                            className={styles.diarBadge}
                            style={{ '--badge-color': color, '--badge-bg': bg }}
                          >
                            {seg.speaker}
                          </span>
                          <span className={styles.diarTime}>{fmt(seg.start)}</span>
                        </div>
                      )}
                      <p className={styles.diarText}>{seg.text}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── CONFIGURAÇÕES DE PERFORMANCE ── */}
        {status === STATUS.SETTINGS && perfCfg && (
          <div className={styles.settingsWrapper}>
            <p className={styles.settingsTitle}>⚡ Performance</p>

            {/* Modelo */}
            <div className={styles.settingsSection}>
              <p className={styles.settingsLabel}>Modelo de transcrição</p>
              <div className={styles.modelGrid}>
                {(perfCfg.availableModels || []).map((m) => {
                  const info = MODEL_LABELS[m] || { label: m, desc: '' }
                  return (
                    <button
                      key={m}
                      className={`${styles.modelCard} ${perfCfg.model === m ? styles.modelCardActive : ''}`}
                      onClick={() => setPerfCfg({ ...perfCfg, model: m })}
                    >
                      <span className={styles.modelCardName}>{info.label}</span>
                      <span className={styles.modelCardDesc}>{info.desc}</span>
                    </button>
                  )
                })}
              </div>
              <p className={styles.settingsHint}>
                💡 Para baixar outros modelos: <code>npm run setup:model -- --model=base</code>
              </p>
            </div>

            {/* Threads */}
            <div className={styles.settingsSection}>
              <p className={styles.settingsLabel}>
                Threads de CPU
                <span className={styles.settingsValue}>{perfCfg.threads} de {perfCfg.cpuCount} disponíveis</span>
              </p>
              <input
                type="range"
                min={1}
                max={perfCfg.cpuCount || 8}
                value={perfCfg.threads}
                onChange={(e) => setPerfCfg({ ...perfCfg, threads: Number(e.target.value) })}
                className={styles.slider}
              />
              <p className={styles.settingsHint}>Mais threads = mais rápido, mas mais CPU usada</p>
            </div>

            {/* Chunk size */}
            <div className={styles.settingsSection}>
              <p className={styles.settingsLabel}>
                Tamanho dos blocos
                <span className={styles.settingsValue}>{perfCfg.chunkSeconds}s por bloco</span>
              </p>
              <input
                type="range"
                min={30}
                max={180}
                step={15}
                value={perfCfg.chunkSeconds}
                onChange={(e) => setPerfCfg({ ...perfCfg, chunkSeconds: Number(e.target.value) })}
                className={styles.slider}
              />
              <p className={styles.settingsHint}>Blocos menores permitem mais paralelismo</p>
            </div>

            <div className={styles.settingsActions}>
              <button className={styles.btnSecondary} onClick={handleCloseSettings}>Cancelar</button>
              <button
                className={`${styles.btnPrimary} ${perfSaved ? styles.btnSaved : ''}`}
                onClick={handleSavePerfCfg}
              >
                {perfSaved ? '✓ Salvo!' : 'Salvar configurações'}
              </button>
            </div>
          </div>
        )}

        {/* ── ERRO ── */}
        {status === STATUS.ERROR && (
          <div className={styles.errorWrapper}>
            <div className={styles.errorIcon}>⚠️</div>
            <p className={styles.errorMsg}>{error}</p>
            <button className={styles.btnPrimary} onClick={handleNew}>Tentar de novo</button>
          </div>
        )}

      </div>
    </div>
  )
}
