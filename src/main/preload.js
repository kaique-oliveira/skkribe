// Preload, exposes a small typed-ish surface to the renderer via window.skkribe.
// Anything beyond this set is unreachable from the renderer's React code.

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('skkribe', {
  // 'darwin' | 'win32' | 'linux' — the renderer adapts chrome details
  // (traffic-light spacer, scrollbars) per platform.
  platform: process.platform,

  // first-run setup
  checkSetup: () => ipcRenderer.invoke('setup:check'),
  getTokenStatus: () => ipcRenderer.invoke('setup:token-status'),
  saveToken: (token) => ipcRenderer.invoke('setup:save-token', token),
  clearToken: () => ipcRenderer.invoke('setup:clear-token'),
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
  // options: { expectedSpeakers: null | 1 | 2 | 3+, mode: 'fast' | 'balanced' | 'max' }
  transcribe: (filePath, options) => ipcRenderer.invoke('transcribe:file', filePath, options),
  onProgress: (cb) => {
    const listener = (_e, payload) => cb(payload)
    ipcRenderer.on('transcribe:progress', listener)
    return () => ipcRenderer.removeListener('transcribe:progress', listener)
  },
})
