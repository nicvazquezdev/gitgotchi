// PR popover: opens above the pet (below when there is no room).
const { createPopup } = require('./popup-window');
const { popoverBounds } = require('./popover-position');
const { POPOVER_WINDOW } = require('../config');

const popup = createPopup({
  page: 'popover',
  channel: 'popover:state',
  size: POPOVER_WINDOW,
  level: 'screen-saver', // same level as the pet window; popup-window raises it one step above
  boundsFor: popoverBounds,
});

/** The page also gets the side of the pet it hangs on: `{ placement: 'above' | 'below' }`. */
function init(stateProvider) {
  popup.init(() => ({ ...stateProvider(), placement: popup.placement()?.placement }));
}

module.exports = { ...popup, init };
