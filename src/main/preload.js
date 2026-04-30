const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // ── Arquivo ────────────────────────────────────────────────
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  // ── Transcrição + Diarização (fluxo unificado) ─────────────
  transcribeFile: (filePath) => ipcRenderer.invoke('transcribe-file', filePath),
  onProgress: (cb) => {
    const h = (_, d) => cb(d)
    ipcRenderer.on('transcription-progress', h)
    return () => ipcRenderer.removeListener('transcription-progress', h)
  },

  // ── Diarização ─────────────────────────────────────────────
  checkDiarization: () => ipcRenderer.invoke('check-diarization'),

  // ── Exportar Markdown ───────────────────────────────────────
  saveMdFile: (baseName, content) => ipcRenderer.invoke('save-md-file', baseName, content),

  // ── Configurações de performance ────────────────────────────
  getPerfConfig:  ()    => ipcRenderer.invoke('get-perf-config'),
  savePerfConfig: (cfg) => ipcRenderer.invoke('save-perf-config', cfg),
})
