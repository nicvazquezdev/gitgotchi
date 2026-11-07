// PR popover: opens above the pet (below when there is no room) with its tail pointing at it.
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

/** The page also gets where the tail goes: `{ placement: 'above' | 'below', tailX }`. */
function init(stateProvider) {
  popup.init(() => {
    const { placement, tailX } = popup.placement() ?? {};
    return { ...stateProvider(), placement, tailX };
  });
}

module.exports = { ...popup, init };
