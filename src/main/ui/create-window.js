// Shared window factory: same security settings and page loading for every window.
const { BrowserWindow, shell } = require('electron');
const path = require('node:path');
const { PRELOAD, RENDERER_DIR } = require('../config');

/** Creates a locked-down window and loads `src/renderer/<page>/index.html`. */
function createWindow(page, options = {}) {
  const win = new BrowserWindow({
    show: false,
    ...options,
    webPreferences: { preload: PRELOAD, contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  // Never navigate away from the app; external links open in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.loadFile(path.join(RENDERER_DIR, page, 'index.html'));
  return win;
}

module.exports = { createWindow };
