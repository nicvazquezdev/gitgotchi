// Factory for the regular app windows (onboarding, settings, profile): one instance per page,
// opened centered on the display in use, with the native traffic lights over the page's 40 px title bar.
// The app lives in the menu bar: on macOS the Dock icon only shows while at least one of these windows is open.
const { app, screen } = require('electron');
const { createWindow } = require('./create-window');
const { centeredIn } = require('./placement');
const { IS_MAC } = require('../config');

const WINDOW_BACKGROUND = '#120726'; // --bg-subtle: what shows before the page paints

let openCount = 0;

function windowOpened() {
  if (openCount++ === 0 && IS_MAC) app.dock?.show();
}

function windowClosed() {
  if (--openCount === 0 && IS_MAC) app.dock?.hide();
}

// Electron opens windows on the primary display by default; use the one the user is working on
// (the cursor is there: they just clicked the menu bar icon or the pet).
const activeDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

/**
 * @param {string} page  folder under src/renderer
 * @param {WindowOptions | (() => WindowOptions)} options  a function is called each time the window is created
 * @typedef {Electron.BrowserWindowConstructorOptions & { width: number, height: number }} WindowOptions
 */
function createAppWindow(page, options) {
  let win = null;
  let size = null; // { width, height } of the window on screen

  /**
   * Shows the window, creating it if needed. Returns true when it was created.
   * `onClosed` only applies to a newly created window: it runs when that window closes.
   * @param {{ onClosed?: () => void }} [hooks]
   */
  function open({ onClosed } = {}) {
    if (win) {
      const display = activeDisplay();
      if (screen.getDisplayMatching(win.getBounds()).id !== display.id) {
        const { x, y } = centeredIn(display.workArea, size);
        win.setPosition(x, y);
      }
      win.show();
      win.focus();
      return false;
    }

    const resolved = typeof options === 'function' ? options() : options;
    size = { width: resolved.width, height: resolved.height };
    windowOpened();
    win = createWindow(page, {
      title: 'Gitgotchi',
      titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 16, y: 14 },
      backgroundColor: WINDOW_BACKGROUND,
      ...resolved,
      ...centeredIn(activeDisplay().workArea, size),
    });
    win.once('ready-to-show', () => {
      win.show();
      app.focus({ steal: true });
    });
    win.on('closed', () => {
      win = null;
      windowClosed();
      onClosed?.();
    });
    return true;
  }

  return {
    open,
    close: () => win?.close(),
    isOpen: () => Boolean(win),
    reload: () => win?.webContents.reload(),
    /** Pushes a channel message to the page, if the window is open. */
    send: (channel, payload) => win?.webContents.send(channel, payload),
  };
}

module.exports = { createAppWindow };
