// Device-level UI settings kept in the store: pet speech bubbles, Do not disturb, system notifications and the review
// count in the menu bar. Other windows read `doNotDisturb()` to stay quiet (notifications, evolution popups).
const store = require('./store');

const speechBubbles = () => store.get().speechBubbles !== false;
const doNotDisturb = () => store.get().doNotDisturb === true;
const notifications = () => store.get().notifications !== false;
const menuBarCount = () => store.get().menuBarCount !== false;

/** What the pet page needs to decide whether to show bubbles. */
const petPrefs = () => ({ speechBubbles: speechBubbles(), doNotDisturb: doNotDisturb() });

/** Flips a boolean setting ('speechBubbles' | 'doNotDisturb' | 'notifications' | 'menuBarCount'). */
function toggle(key) {
  store.update({ [key]: !store.get()[key] });
}

module.exports = { speechBubbles, doNotDisturb, notifications, menuBarCount, petPrefs, toggle };
