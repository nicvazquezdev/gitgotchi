// Profile > Achievements: a console-style trophy case. A banner with the score and the trophies of each tier, what
// is closest to unlock, a filter, and every achievement as a collectible tile (pixel medals by tier).
import { h } from '../shared/dom.js';
import { medal, cup, lock, digits } from '../shared/pixel-art.js';
import { dayLabel } from '../shared/format.js';

export { dayLabel }; // the collection view uses it too

const NEW_FOR_DAYS = 2; // an achievement unlocked this recently gets a NEW tag
const NEXT_UP = 3; // how many are suggested

export const FILTERS = [
  ['all', 'All'],
  ['unlocked', 'Unlocked'],
  ['locked', 'Locked'],
];

// ---------- Pure helpers ----------

const itemsOf = ({ groups }) => groups.flatMap((group) => group.items);

/**
 * The achievements closest to unlock: only the next step of each family (not the whole ladder), the most complete
 * first. Ones with nothing done yet follow, the smallest goals first, so a new pet gets "start here" suggestions.
 */
export function nextUp(view, count = NEXT_UP) {
  const nextOfFamily = new Map();
  for (const a of itemsOf(view).filter((item) => !item.unlockedAt)) {
    const current = nextOfFamily.get(a.metric);
    if (!current || a.target < current.target) nextOfFamily.set(a.metric, a);
  }
  const done = (a) => a.value / a.target;
  return [...nextOfFamily.values()].sort((a, b) => done(b) - done(a) || a.target - b.target).slice(0, count);
}

/** "33 to go" */
export const toGo = (a) => `${a.target - a.value} to go`;

/** "17 / 50 reviews", or null for a one-time achievement (there is nothing to count). */
export const countText = (a) => (a.target > 1 ? `${a.value} / ${a.target} ${a.unit}` : null);

/** How many of `count` blocks to fill: at least one as soon as there is progress. */
export const filledBlocks = (value, target, count) =>
  value <= 0 ? 0 : Math.min(count, Math.max(1, Math.floor((value / target) * count)));

/** Days from the day 'YYYY-MM-DD' to `now` (a Date). */
export function daysSince(day, now = new Date()) {
  const [y, m, d] = day.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - new Date(y, m - 1, d)) / 86400000);
}

/** What a filter shows: the groups with their matching items; groups left empty are dropped. */
export function applyFilter(groups, filter) {
  const keep = { all: () => true, unlocked: (a) => a.unlockedAt, locked: (a) => !a.unlockedAt }[filter] ?? (() => true);
  return groups.map((group) => ({ ...group, items: group.items.filter(keep) })).filter((group) => group.items.length);
}

// ---------- Parts ----------

/** Blocks like the XP bar, colored by the tier around them. */
function segments(value, target, count) {
  const filled = filledBlocks(value, target, count);
  return h(
    'div',
    { class: 'segs', role: 'progressbar', ariaValueNow: value, ariaValueMax: target },
    Array.from({ length: count }, (_, i) => h('i', { class: i < filled ? 'on' : '' })),
  );
}

const spark = (x, y, delay) => {
  const el = h('i', { class: 'spark', ariaHidden: 'true' });
  el.style.setProperty('--x', x);
  el.style.setProperty('--y', y);
  el.style.setProperty('--delay', delay);
  return el;
};

/** The medal of an achievement; a locked one is a dim silhouette with a padlock. */
function medalOf(a, scale) {
  const done = Boolean(a.unlockedAt);
  return h(
    'div',
    { class: `ach-medal${done ? '' : ' tier-locked'}` },
    medal(a.icon, scale),
    done ? [spark('8%', '6%', '0s'), spark('86%', '62%', '1.1s')] : h('div', { class: 'ach-lock' }, lock(2)),
  );
}

function banner({ name, achievements: view }) {
  const { unlocked, total, points, totalPoints, tiers } = view;
  const complete = unlocked === total;
  return h(
    'section',
    { class: 'ach-banner pixel-cut' },
    h(
      'div',
      { class: 'ach-banner-in pixel-cut' },
      h('div', { class: 'ab-trophy tier-gold' }, cup(6)),
      h(
        'div',
        { class: 'ab-count' },
        h('div', { class: 'ab-label' }, 'Trophy case'),
        h(
          'div',
          { class: 'ab-digits', role: 'img', ariaLabel: `${unlocked} of ${total} unlocked` },
          digits(`${unlocked}/${total}`, 5),
        ),
        segments(unlocked, total, 20),
        h(
          'div',
          { class: 'meta' },
          complete ? 'Collection complete!' : `${total - unlocked} to go · counted since ${name} hatched`,
        ),
      ),
      h(
        'div',
        { class: 'ab-score' },
        h('div', { class: 'ab-label' }, 'Score'),
        h(
          'div',
          { class: 'ab-digits ab-points', role: 'img', ariaLabel: `${points} points` },
          digits(String(points), 5),
        ),
        h('div', { class: 'meta' }, `of ${totalPoints} points`),
      ),
      h(
        'div',
        { class: 'ab-tiers' },
        tiers.map((tier) =>
          h(
            'div',
            {
              class: `ab-tier tier-${tier.id}${tier.unlocked ? '' : ' none'}`,
              title: `${tier.name}: ${tier.unlocked} of ${tier.total}`,
            },
            cup(3),
            h('b', {}, `${tier.unlocked}/${tier.total}`),
            h('span', {}, tier.name),
          ),
        ),
      ),
    ),
  );
}

function nextUpCard(a, tierNames) {
  const text = countText(a);
  return h(
    'div',
    { class: `ach-next tier-${a.tier} pixel-cut` },
    h(
      'div',
      { class: 'ach-next-in pixel-cut' },
      medalOf({ ...a, unlockedAt: null }, 3),
      h(
        'div',
        { class: 'ach-next-body' },
        h('div', { class: 'ach-name' }, a.name),
        h('div', { class: 'ach-desc' }, a.description),
        segments(a.value, a.target, 12),
        h('div', { class: 'ach-next-foot' }, h('span', {}, text ?? 'Not started'), h('b', {}, toGo(a))),
      ),
      h('span', { class: 'ach-pts' }, `${tierNames[a.tier]} · ${a.points} pts`),
    ),
  );
}

function nextUpSection(view, tierNames) {
  const next = nextUp(view);
  return h(
    'section',
    { class: 'ach-section' },
    h('div', { class: 'ach-head' }, h('h3', {}, 'Next up'), h('span', { class: 'meta' }, 'The closest to unlock')),
    next.length
      ? h(
          'div',
          { class: 'ach-next-grid' },
          next.map((a) => nextUpCard(a, tierNames)),
        )
      : h(
          'div',
          { class: 'ach-all-done pixel-cut' },
          h(
            'div',
            { class: 'ach-all-done-in pixel-cut' },
            h('div', { class: 'tier-gold' }, cup(4)),
            'You have every achievement. Legend!',
          ),
        ),
  );
}

function filterBar(view, filter, onFilter) {
  const counts = { all: view.total, unlocked: view.unlocked, locked: view.total - view.unlocked };
  return h(
    'div',
    { class: 'seg', role: 'group', 'aria-label': 'Show' },
    FILTERS.map(([id, label]) =>
      h(
        'button',
        { class: 'seg-btn', type: 'button', 'aria-pressed': String(id === filter), onclick: () => onFilter(id) },
        label,
        h('span', { class: 'count-chip' }, counts[id]),
      ),
    ),
  );
}

function tile(a, index, tierNames, now) {
  const done = Boolean(a.unlockedAt);
  const fresh = done && daysSince(a.unlockedAt, now) <= NEW_FOR_DAYS;
  const text = countText(a);
  const foot = done
    ? h('div', { class: 'ach-date' }, `Unlocked ${dayLabel(a.unlockedAt, now)}`)
    : text
      ? [segments(a.value, a.target, 10), h('div', { class: 'ach-count' }, text)]
      : h('div', { class: 'ach-count' }, '1 to go');
  const el = h(
    'div',
    { class: `ach tier-${a.tier}${done ? ' done' : ' locked'}` },
    h(
      'div',
      { class: 'ach-frame pixel-cut' },
      h(
        'div',
        { class: 'ach-in pixel-cut' },
        h(
          'div',
          { class: 'ach-top' },
          h('span', { class: 'ach-tier' }, tierNames[a.tier]),
          h('span', { class: 'ach-pts' }, `${a.points} pts`),
        ),
        medalOf(a, 3),
        fresh ? h('span', { class: 'ach-new' }, 'NEW') : null,
        h('div', { class: 'ach-name' }, a.name),
        h('div', { class: 'ach-desc' }, a.description),
        h('div', { class: 'ach-foot' }, foot),
      ),
    ),
  );
  el.style.setProperty('--i', index);
  return el;
}

function group(g, tierNames, now, start) {
  const done = g.items.filter((a) => a.unlockedAt).length;
  return h(
    'section',
    { class: 'ach-section' },
    h(
      'div',
      { class: 'ach-head' },
      h('h3', {}, g.name),
      g.note ? h('span', { class: 'meta' }, g.note) : null,
      h(
        'span',
        { class: 'ach-slots', ariaHidden: 'true' },
        g.items.map((a) => h('i', { class: `slot tier-${a.tier}${a.unlockedAt ? ' on' : ''}` })),
      ),
      h('span', { class: 'meta ach-group-count' }, `${done} / ${g.items.length}`),
    ),
    h(
      'div',
      { class: 'ach-grid' },
      g.items.map((a, i) => tile(a, start + i, tierNames, now)),
    ),
  );
}

/**
 * The page. `enter`: play the pop-in of the tiles (when the view was just opened, not on every update).
 * @param {object} status  the pet status (`name`, `achievements`)
 * @param {{ filter: string, onFilter: (id: string) => void, enter?: boolean, now?: Date }} options
 */
export function achievementsPage(status, { filter, onFilter, enter = false, now = new Date() }) {
  const view = status.achievements;
  const tierNames = Object.fromEntries(view.tiers.map((tier) => [tier.id, tier.name]));
  const groups = applyFilter(view.groups, filter);
  let start = 0;
  const sections = groups.map((g) => {
    const section = group(g, tierNames, now, start);
    start += g.items.length;
    return section;
  });
  return h(
    'div',
    { class: `ach-page${enter ? ' enter' : ''}` },
    banner(status),
    nextUpSection(view, tierNames),
    h('div', { class: 'ach-toolbar' }, h('h3', {}, 'All achievements'), filterBar(view, filter, onFilter)),
    sections.length
      ? sections
      : h(
          'p',
          { class: 'ach-empty' },
          filter === 'unlocked'
            ? 'Nothing unlocked yet. Open a PR or review one to get your first!'
            : 'Nothing left to unlock. Legend!',
        ),
  );
}
