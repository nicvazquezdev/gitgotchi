// System notifications (macOS Notification Center) for the few moments worth interrupting the user for.
// What to say and what to leave out is decided by notify-plan.js; this file only shows them and handles the click.
const { Notification } = require('electron');
const { planNotifications, COOLDOWN_MS } = require('../notify-plan');

// Things that arrive together (three review requests in one fetch) are one notification: wait a moment for the rest.
const BATCH_MS = 2000;
// Electron needs a reference to a notification for its click to be heard; drop it after a while.
const KEEP_MS = 10 * 60 * 1000;

/**
 * @param {{ isEnabled: () => boolean, openPullRequest: (url: string) => void, openPopover: () => void }} options
 *   `isEnabled`: the user wants notifications and is not in Do not disturb (checked when an item arrives and again
 *   when the batch is shown).
 */
function createNotifier({ isEnabled, openPullRequest, openPopover }) {
  const recent = new Map(); // `kind:id` -> when it was announced
  const alive = new Set();
  let queue = [];
  let timer = null;

  function show({ target, title, subtitle, body, silent }) {
    const notification = new Notification({ title, subtitle, body, silent });
    alive.add(notification);
    setTimeout(() => alive.delete(notification), KEEP_MS).unref?.();
    notification.on('click', () => (target.type === 'pr' ? openPullRequest(target.url) : openPopover()));
    notification.show();
  }

  function flush() {
    timer = null;
    const items = queue;
    queue = [];
    if (!isEnabled()) return;
    const now = Date.now();
    for (const [key, at] of recent) if (now - at >= COOLDOWN_MS) recent.delete(key);
    const { notifications, shown } = planNotifications(items, { recent, now });
    for (const key of shown) recent.set(key, now);
    notifications.forEach(show);
  }

  return {
    /** @param {object[]} items  the 'attention' items of the pet service */
    notify(items) {
      if (!isEnabled() || !Notification.isSupported()) return;
      queue.push(...items);
      timer ??= setTimeout(flush, BATCH_MS);
    },
  };
}

module.exports = { createNotifier };
