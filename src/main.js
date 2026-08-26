const { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, screen } = require('electron');
const path = require('path');

// WGC cannot capture a monitor while a full-screen window on it uses
// WDA_EXCLUDEFROMCAPTURE. The legacy WebRTC backend supports this overlay model.
app.commandLine.appendSwitch(
  'disable-features',
  'WebRtcAllowWgcDesktopCapturer,WebRtcAllowWgcScreenCapturer,WebRtcAllowWgcWindowCapturer'
);

const windows = new Map();
let controlsVisible = true;
let passthrough = false;

function broadcast(channel, value) {
  for (const win of windows.values()) win.webContents.send(channel, value);
}

function createOverlay(display, isPrimary) {
  const win = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: false,
    backgroundColor: '#f7f7f2',
    fullscreen: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setContentProtection(true);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), {
    query: { displayId: String(display.id), primary: String(isPrimary) }
  });
  win.on('closed', () => windows.delete(display.id));
  windows.set(display.id, win);
}

function rebuildWindows() {
  for (const win of windows.values()) win.destroy();
  windows.clear();
  const primaryId = screen.getPrimaryDisplay().id;
  for (const display of screen.getAllDisplays()) createOverlay(display, display.id === primaryId);
}

app.whenReady().then(() => {
  ipcMain.handle('screen-source', async (_event, displayId) => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
    const exact = sources.find((source) => String(source.display_id) === String(displayId));
    return (exact || sources[0])?.id;
  });
  ipcMain.on('quit', () => app.quit());
  ipcMain.on('set-passthrough', (_event, value) => {
    passthrough = Boolean(value);
    for (const win of windows.values()) win.setIgnoreMouseEvents(passthrough, { forward: true });
    broadcast('passthrough', passthrough);
  });

  rebuildWindows();
  screen.on('display-added', rebuildWindows);
  screen.on('display-removed', rebuildWindows);
  screen.on('display-metrics-changed', rebuildWindows);

  globalShortcut.register('CommandOrControl+Shift+W', () => {
    controlsVisible = !controlsVisible;
    broadcast('controls-visible', controlsVisible);
  });
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    passthrough = !passthrough;
    for (const win of windows.values()) win.setIgnoreMouseEvents(passthrough, { forward: true });
    broadcast('passthrough', passthrough);
  });
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
