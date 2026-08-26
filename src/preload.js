const { contextBridge, desktopCapturer, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blackFlash', {
  getSourceId: (displayId) => ipcRenderer.invoke('screen-source', displayId),
  quit: () => ipcRenderer.send('quit'),
  setPassthrough: (value) => ipcRenderer.send('set-passthrough', value),
  onControlsVisible: (callback) => ipcRenderer.on('controls-visible', (_event, value) => callback(value)),
  onPassthrough: (callback) => ipcRenderer.on('passthrough', (_event, value) => callback(value))
});
