// Settings window: preferences that are set once (pet size, speech bubbles, open at login, cloud backup)
// plus the way back to the setup flow. Everyday switches stay in the menu bar dropdown.
const { createAppWindow } = require('./app-window');
const { SETTINGS_WINDOW } = require('../config');

const settings = createAppWindow('settings', {
  ...SETTINGS_WINDOW,
  resizable: false,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
});

let getState = () => null;

module.exports = {
  /** @param {() => object} stateProvider  what the page shows (sent on open and on every update) */
  init: (stateProvider) => (getState = stateProvider),
  open: () => settings.open(),
  state: () => getState(),
  /** Pushes the current state to the page (no-op while closed). */
  send: () => settings.isOpen() && settings.send('settings:state', getState()),
};
