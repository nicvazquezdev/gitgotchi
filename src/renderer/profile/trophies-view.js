// Trophies: every achievement as a pixel medal in the color of its tier (dim while locked), and under them the one
// that is selected: what it asks, and how far you are. It opens on the one closest to unlock.
import { h } from '../shared/dom.js';
import { medal } from '../shared/pixel-art.js';
import { dayLabel } from '../shared/format.js';
import { gridMove } from './grid.js';

export { dayLabel };

export const COLUMNS = 7;
const NEXT_UP = 3; // how many are suggested

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

// ---------- Parts ----------

/** The medal of an achievement: the color of its tier, or dim while it is locked. */
const medalOf = (a, scale) =>
  h('span', { class: `medal-art ${a.unlockedAt ? `tier-${a.tier}` : 'tier-locked'}` }, medal(a.icon, scale));

/** Blocks like the XP bar. */
function segments(value, target, count) {
  const filled = filledBlocks(value, target, count);
  return h(
    'div',
    { class: 'segs', role: 'progressbar', ariaValueNow: value, ariaValueMax: target },
    Array.from({ length: count }, (_, i) => h('i', { class: i < filled ? 'on' : '' })),
  );
}

function detail(a, now) {
  const done = Boolean(a.unlockedAt);
  return h(
    'section',
    { class: 'detail', 'aria-live': 'polite' },
    medalOf(a, 3),
    h(
      'div',
      { class: 't' },
      h('b', {}, a.name),
      h('span', { class: 'meta' }, a.description),
      done
        ? h('span', { class: 'meta when' }, `Unlocked ${dayLabel(a.unlockedAt, now)}`)
        : [segments(a.value, a.target, 10), h('span', { class: 'meta' }, countText(a) ?? 'Not started')],
    ),
    !done && a.target > 1 ? h('span', { class: 'count' }, `${a.value}/${a.target}`) : null,
  );
}

// ---------- Page ----------

let selected = null; // id on show; null: the closest to unlock

/** Leaving the page: next time it opens on the closest to unlock again. */
export function leaveTrophies() {
  selected = null;
}

/** @param {{ rerender: (options?: { focus?: string }) => void, now?: Date }} options */
export function trophiesPage(status, { rerender, now = new Date() }) {
  const view = status.achievements;
  const items = itemsOf(view);
  if (!items.some((a) => a.id === selected)) selected = (nextUp(view, 1)[0] ?? items[0]).id;
  const current = items.find((a) => a.id === selected);

  const select = (id) => {
    selected = id;
    rerender({ focus: id });
  };
  const move = (e) => {
    const at = items.findIndex((a) => a.id === selected);
    const to = gridMove(at, e.key, items.length, COLUMNS);
    if (to === at && !['Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    select(items[to].id);
  };

  return h(
    'div',
    { class: 'trophies-page' },
    h(
      'div',
      { class: 'medals', role: 'listbox', 'aria-label': 'Trophies', onkeydown: move },
      items.map((a) =>
        h(
          'button',
          {
            class: `medal-cell${a.id === selected ? ' sel' : ''}`,
            type: 'button',
            role: 'option',
            'aria-selected': String(a.id === selected),
            'aria-label': `${a.name}${a.unlockedAt ? ', unlocked' : ', locked'}`,
            tabIndex: a.id === selected ? 0 : -1,
            dataset: { key: a.id },
            title: a.name,
            onclick: () => select(a.id),
          },
          medalOf(a, 2),
        ),
      ),
    ),
    detail(current, now),
  );
}
