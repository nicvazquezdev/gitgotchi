// Profile window: the pet's level, evolution line, weekly activity and XP rules; the collection; the achievements.
const { createAppWindow } = require('./app-window');
const { PROFILE_WINDOW } = require('../config');

const profile = createAppWindow('profile', {
  ...PROFILE_WINDOW,
  resizable: false,
  maximizable: false,
  fullscreenable: false,
});

const VIEWS = ['overview', 'collection', 'achievements'];
let requested = null; // the view the page should show when it starts

module.exports = {
  /** Opens the window; `view` picks the tab (a window that is already open switches to it). */
  open: (view) => {
    requested = VIEWS.includes(view) ? view : null;
    if (!profile.open() && requested) profile.send('profile:view', requested);
  },
  /** The view asked for by the last open, once: the page reads it when it starts. */
  takeView: () => {
    const view = requested;
    requested = null;
    return view;
  },
  send: profile.send,
};
