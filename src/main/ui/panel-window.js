// Menu-bar dropdown: opened from the tray icon or a right-click on the pet.
const { createPopup } = require('./popup-window');
const { panelBounds } = require('./panel-position');
const { PANEL_WINDOW } = require('../config');

module.exports = createPopup({
  page: 'panel',
  channel: 'panel:state',
  size: PANEL_WINDOW,
  level: 'pop-up-menu',
  boundsFor: panelBounds,
});
