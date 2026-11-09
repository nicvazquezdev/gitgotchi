// Share window: the card of the pet (an image to copy and show off).
const { createAppWindow } = require('./app-window');
const { SHARE_WINDOW } = require('../config');

const share = createAppWindow('share', {
  ...SHARE_WINDOW,
  resizable: false,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
});

module.exports = { open: () => share.open(), send: share.send };
