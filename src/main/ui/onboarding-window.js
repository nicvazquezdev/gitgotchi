// Onboarding / settings window.
const { app, screen } = require('electron');
const { createWindow } = require('./create-window');
const { centeredIn } = require('./placement');
const { ONBOARDING_WINDOW, IS_MAC } = require('../config');

let win = null;

// Electron opens windows on the primary display by default; use the one the user is working on
// (the cursor is there: they just clicked the menu bar icon or the pet).
const activeDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

/** @param {{ onClosed?: () => void }} hooks */
function open({ onClosed } = {}) {
  if (win) {
    const display = activeDisplay();
    if (screen.getDisplayMatching(win.getBounds()).id !== display.id) {
      const { x, y } = centeredIn(display.workArea, ONBOARDING_WINDOW);
      win.setPosition(x, y);
    }
    win.show();
    win.focus();
    return;
  }

  // The app lives in the menu bar; the Dock icon only shows while a regular window is open.
  if (IS_MAC) app.dock?.show();

  win = createWindow('onboarding', {
    ...ONBOARDING_WINDOW,
    ...centeredIn(activeDisplay().workArea, ONBOARDING_WINDOW),
    title: 'Gitgotchi',
    backgroundColor: '#14102a',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
  });
  win.once('ready-to-show', () => {
    win.show();
    app.focus({ steal: true });
  });
  win.on('closed', () => {
    win = null;
    if (IS_MAC) app.dock?.hide();
    onClosed?.();
  });
}

function close() {
  win?.close();
}

module.exports = { open, close };
