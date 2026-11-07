// Evolution celebration window (dark, shown when the pet reaches a new stage).
const { createAppWindow } = require('./app-window');
const { EVOLUTION_WINDOW } = require('../config');

const celebration = createAppWindow('evolution', {
  ...EVOLUTION_WINDOW,
  backgroundColor: '#1b1630',
  resizable: false,
  maximizable: false,
  fullscreenable: false,
});

let evolution = null; // { fromIndex, toIndex }: what the page shows

/** @param {{ fromIndex: number, toIndex: number }} next  stage indexes of the evolution to celebrate */
function open(next) {
  evolution = next;
  // A newer evolution replaces the one on screen.
  if (!celebration.open()) celebration.reload();
}

module.exports = { open, close: celebration.close, current: () => evolution };
