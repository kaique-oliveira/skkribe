// Preload — exposes a small typed-ish surface to the renderer via window.skribe.
// Anything beyond this set is unreachable from the renderer's React code.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('skribe', {
  // first-run setup
  checkSetup: () => ipcRenderer.invoke('setup:check'),
  runSetup: () => ipcRenderer.invoke('setup:run'),
  onSetupProgress: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('setup:progress', listener)
    return () => ipcRenderer.removeListener('setup:progress', listener)
  },

  // dialogs
  openAudioDialog: () => ipcRenderer.invoke('dialog:open-audio'),
  saveMarkdown: (baseName, content) => ipcRenderer.invoke('dialog:save-md', baseName, content),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),

  // pipeline
  // expectedSpeakers: null | 1 | 2 | 3+ (the renderer's SpeakerCountView selection)
  transcribe: (filePath, expectedSpeakers) => ipcRenderer.invoke('transcribe:file', filePath, expectedSpeakers),
  onProgress: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('transcribe:progress', listener)
    return () => ipcRenderer.removeListener('transcribe:progress', listener)
  },
})
