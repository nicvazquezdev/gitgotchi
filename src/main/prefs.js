// Device-level UI settings kept in the store: pet speech bubbles. (Being away is a vacation, see game/time-off.js and
// the pet service.)
const store = require('./store');

const speechBubbles = () => store.get().speechBubbles !== false;

/** What the pet window needs to decide whether to show bubbles. */
const petPrefs = () => ({ speechBubbles: speechBubbles() });

/** Flips a boolean setting ('speechBubbles'). */
function toggle(key) {
  store.update({ [key]: !store.get()[key] });
}

module.exports = { speechBubbles, petPrefs, toggle };
