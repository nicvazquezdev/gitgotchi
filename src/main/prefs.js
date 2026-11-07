// Device-level UI settings kept in the store: pet speech bubbles and Do not disturb.
// Other windows read `doNotDisturb()` to stay quiet (notifications, evolution popups).
const store = require('./store');

const speechBubbles = () => store.get().speechBubbles !== false;
const doNotDisturb = () => store.get().doNotDisturb === true;

/** What the pet page needs to decide whether to show bubbles. */
const petPrefs = () => ({ speechBubbles: speechBubbles(), doNotDisturb: doNotDisturb() });

/** Flips a boolean setting ('speechBubbles' | 'doNotDisturb'). */
function toggle(key) {
  store.update({ [key]: !store.get()[key] });
}

module.exports = { speechBubbles, doNotDisturb, petPrefs, toggle };
