// What system notifications to show for a batch of things the user may want to hear about (pure, no Electron).
// The items come from the pet service ('attention'): `{ kind, id, title, repo, number, url, author, via }`.

/** The same thing is not announced twice for a PR inside this window (a flaky build fails, reruns, fails again). */
const COOLDOWN_MS = 30 * 60 * 1000;
const MAX_TITLES = 2; // titles listed in a notification that sums up several PRs

// Three kinds, most urgent first: someone asks for the user's review, a PR of theirs needs them (changes asked, checks
// failed or merge conflicts: only its author can fix it) and a PR of theirs is ready to merge. An approval alone is not
// news: what it makes possible is (ready to merge). `silent`: good news, no sound.
const REASONS = {
  changesRequested: 'Changes requested',
  checksFailed: 'Checks failed',
  mergeConflicts: 'Merge conflicts',
};
const GROUPS = [
  {
    kinds: ['reviewRequested'],
    one: () => 'Review requested',
    many: (n) => `${n} review requests`,
    silent: false,
  },
  {
    kinds: Object.keys(REASONS),
    one: (item) => REASONS[item.kind], // one PR says what is wrong with it
    many: (n) => `${n} of your PRs need you`,
    silent: false,
  },
  {
    kinds: ['readyToMerge'],
    one: () => 'Ready to merge',
    many: (n) => `${n} PRs ready to merge`,
    silent: true,
  },
];
const KNOWN = new Set(GROUPS.flatMap((group) => group.kinds));

const keyOf = (item) => `${item.kind}:${item.id}`;

/** 'acme/web-app #12 · ana · via code': where it is and, for a review request, who asked. */
function subtitleOf({ repo, number, author, via }) {
  const team = via ? `via ${via.includes('/') ? via.split('/')[1] : via}` : null;
  return [`${repo.split('/').pop()} #${number}`, author, team].filter(Boolean).join(' · ');
}

/**
 * @param {object[]} items
 * @param {{ recent?: Map<string, number>, now?: number }} [options]
 *   `recent`: when each `kind:id` was last announced (ms), to leave out what was just said.
 * @returns {{ notifications: { title: string, subtitle?: string, body: string, silent: boolean,
 *   target: { type: 'pr', url: string } | { type: 'popover' } }[], shown: string[] }}
 *   `shown`: the keys of the items the notifications cover; the caller records them as announced.
 *   One notification per kind: a single PR gets its own (clicking opens it), several are summed up (clicking opens
 *   the card).
 */
function planNotifications(items, { recent = new Map(), now = Date.now() } = {}) {
  const fresh = new Map(); // key -> item, one per PR and kind
  for (const item of items) {
    const key = keyOf(item);
    const last = recent.get(key);
    if (KNOWN.has(item.kind) && !fresh.has(key) && !(last !== undefined && now - last < COOLDOWN_MS))
      fresh.set(key, item);
  }

  const notifications = [];
  for (const copy of GROUPS) {
    const group = [...fresh.values()].filter((item) => copy.kinds.includes(item.kind));
    if (group.length === 0) continue;
    if (group.length === 1) {
      const [item] = group;
      notifications.push({
        title: copy.one(item),
        subtitle: subtitleOf(item),
        body: item.title,
        silent: copy.silent,
        target: { type: 'pr', url: item.url },
      });
    } else {
      const titles = group.slice(0, MAX_TITLES).map((item) => item.title);
      if (group.length > MAX_TITLES) titles.push(`+${group.length - MAX_TITLES} more`);
      notifications.push({
        title: copy.many(group.length),
        body: titles.join('\n'),
        silent: copy.silent,
        target: { type: 'popover' },
      });
    }
  }
  return { notifications, shown: [...fresh.keys()] };
}

module.exports = { planNotifications, COOLDOWN_MS, MAX_TITLES };
