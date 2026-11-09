// Device-level UI settings kept in the store: pet speech bubbles and playfulness. (Being away is a vacation, see game/time-off.js and
// the pet service.)
const store = require('./store');

const speechBubbles = () => store.get().speechBubbles !== false;
const playful = () => store.get().playful !== false;

/** What the pet window needs: whether to show bubbles and whether the pet answers the hand. */
const petPrefs = () => ({ speechBubbles: speechBubbles(), playful: playful() });

/** Flips a boolean setting ('speechBubbles', 'playful'). */
function toggle(key) {
  store.update({ [key]: !store.get()[key] });
}

module.exports = { speechBubbles, playful, petPrefs, toggle };
