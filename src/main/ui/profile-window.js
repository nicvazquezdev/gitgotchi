// Collection window: the pets, the trophies and the XP you earned (what and why), with the rules of XP in a sheet.
const { createAppWindow } = require('./app-window');
const { PROFILE_WINDOW } = require('../config');

const profile = createAppWindow('profile', {
  ...PROFILE_WINDOW,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
});

const VIEWS = ['pets', 'trophies', 'xp'];
let requested = null; // the view the page should show when it starts

module.exports = {
  /** Opens the window; `view` picks where it starts (a window that is already open goes there). */
  open: (view) => {
    requested = VIEWS.includes(view) ? view : null;
    if (!profile.open()) profile.send('profile:view', requested ?? 'pets');
  },
  /** The view asked for by the last open, once: the page reads it when it starts. */
  takeView: () => {
    const view = requested;
    requested = null;
    return view;
  },
  send: profile.send,
};
