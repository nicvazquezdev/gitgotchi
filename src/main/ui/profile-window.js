// Profile window: the pet's level, evolution line, weekly activity and XP rules.
const { createAppWindow } = require('./app-window');
const { PROFILE_WINDOW } = require('../config');

const window = createAppWindow('profile', {
  ...PROFILE_WINDOW,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
});

module.exports = { open: () => window.open(), send: window.send };
