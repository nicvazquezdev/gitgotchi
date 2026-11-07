// Onboarding window: connect GitHub, pick repos and the pet. Also reopened later to change any of them.
const { nativeTheme } = require('electron');
const { createAppWindow } = require('./app-window');
const { ONBOARDING_WINDOW } = require('../config');

const window = createAppWindow('onboarding', {
  ...ONBOARDING_WINDOW,
  backgroundColor: nativeTheme.shouldUseDarkColors ? '#1d1a26' : '#ffffff', // --bg
});

module.exports = { open: window.open, close: window.close };
