// Onboarding / settings window.
const { app } = require('electron');
const { createWindow } = require('./create-window');
const { ONBOARDING_WINDOW, IS_MAC } = require('../config');

let win = null;

/** @param {{ onClosed?: () => void }} hooks */
function open({ onClosed } = {}) {
  if (win) {
    win.show();
    win.focus();
    return;
  }

  // The app lives in the menu bar; the Dock icon only shows while a regular window is open.
  if (IS_MAC) app.dock?.show();

  win = createWindow('onboarding', {
    ...ONBOARDING_WINDOW,
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
