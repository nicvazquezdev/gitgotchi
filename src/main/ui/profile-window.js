// Profile window: the pet's level, evolution line, weekly activity and XP rules.
const { app, screen } = require('electron');
const { createWindow } = require('./create-window');
const { centeredIn } = require('./placement');
const { PROFILE_WINDOW, IS_MAC } = require('../config');

let win = null;

const activeDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

function open() {
  if (win) {
    const display = activeDisplay();
    if (screen.getDisplayMatching(win.getBounds()).id !== display.id) {
      const { x, y } = centeredIn(display.workArea, PROFILE_WINDOW);
      win.setPosition(x, y);
    }
    win.show();
    win.focus();
    return;
  }

  // The app lives in the menu bar; the Dock icon only shows while a regular window is open.
  if (IS_MAC) app.dock?.show();

  win = createWindow('profile', {
    ...PROFILE_WINDOW,
    ...centeredIn(activeDisplay().workArea, PROFILE_WINDOW),
    title: 'Gitgotchi',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 14 },
  });
  win.once('ready-to-show', () => {
    win.show();
    app.focus({ steal: true });
  });
  win.on('closed', () => {
    win = null;
    if (IS_MAC) app.dock?.hide();
  });
}

/** Pushes a channel message to the page, if the window is open. */
function send(channel, payload) {
  if (win) win.webContents.send(channel, payload);
}

module.exports = { open, send };
