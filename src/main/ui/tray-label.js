// What the menu bar shows next to the pet icon (pure): the number of PRs waiting for the user's review.
// It is the part of the app that is a standing state, not an event: notifications tell you something just happened,
// this tells you how much is waiting, even if you missed (or turned off) the notifications.

const MAX_SHOWN = 99;

/**
 * @param {number} count  PRs waiting for the user's review
 * @param {boolean} enabled  the "review count in the menu bar" setting
 * @returns {{ title: string, tooltip: string }}  `title`: the text next to the icon ('' for nothing)
 */
function trayLabel(count, enabled) {
  const n = enabled && count > 0 ? count : 0;
  if (n === 0) return { title: '', tooltip: 'Gitgotchi' };
  return {
    title: n > MAX_SHOWN ? `${MAX_SHOWN}+` : String(n),
    tooltip: `Gitgotchi: ${n === 1 ? '1 PR needs' : `${n} PRs need`} your review`,
  };
}

module.exports = { trayLabel };
