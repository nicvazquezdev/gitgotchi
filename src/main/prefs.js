// Device-level UI settings kept in the store: pet speech bubbles and system notifications. (Being quiet for a while is
// a pause, see game/pause.js and the pet service.)
const store = require('./store');

const speechBubbles = () => store.get().speechBubbles !== false;
const notifications = () => store.get().notifications !== false;

/** What the pet page needs to decide whether to show bubbles. */
const petPrefs = () => ({ speechBubbles: speechBubbles() });

/** Flips a boolean setting ('speechBubbles' | 'notifications'). */
function toggle(key) {
  store.update({ [key]: !store.get()[key] });
}

module.exports = { speechBubbles, notifications, petPrefs, toggle };
