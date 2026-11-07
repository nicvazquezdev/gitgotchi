// Evolution celebration window (dark, shown when the pet reaches a new stage).
const { app, screen } = require('electron');
const { createWindow } = require('./create-window');
const { centeredIn } = require('./placement');
const { EVOLUTION_WINDOW, IS_MAC } = require('../config');

let win = null;
let evolution = null; // { fromIndex, toIndex }: what the page shows

const activeDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint());

/** @param {{ fromIndex: number, toIndex: number }} next  stage indexes of the evolution to celebrate */
function open(next) {
  evolution = next;
  if (win) {
    win.webContents.reload(); // a newer evolution replaces the one on screen
    win.show();
    win.focus();
    return;
  }

  if (IS_MAC) app.dock?.show();

  win = createWindow('evolution', {
    ...EVOLUTION_WINDOW,
    ...centeredIn(activeDisplay().workArea, EVOLUTION_WINDOW),
    title: 'Gitgotchi',
    backgroundColor: '#1b1630',
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

const close = () => win?.close();
const current = () => evolution;

module.exports = { open, close, current };
