// XP: what you earned, day by day, and why (the newest day first). Whichever pet was earning it: the XP is yours.
import { h } from '../shared/dom.js';
import { timeAgo, dayLabel } from '../shared/format.js';
import { xpRules } from './xp-rules.js';

let rulesOpen = false; // the rules of XP are on show, in the place of the log

/** Leaving the tab: the log comes back. */
export const leaveHistory = () => (rulesOpen = false);

const plural = (n, one, many) => (n === 1 ? one : many(n));
const REASONS = {
  prs: (n) => plural(n, 'Opened a PR', (c) => `Opened ${c} PRs`),
  merges: (n) => plural(n, 'Got a PR merged', (c) => `Got ${c} PRs merged`),
  reviews: (n) => plural(n, 'Reviewed a PR', (c) => `Reviewed ${c} PRs`),
  fastReviews: (n) => plural(n, 'Answered a request within the hour', (c) => `Answered ${c} requests within the hour`),
  issues: (n) => plural(n, 'Opened an issue', (c) => `Opened ${c} issues`),
  commits: (n) => plural(n, 'Pushed a commit', (c) => `Pushed ${c} commits`),
};

const localDay = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "Today", "Yesterday", or "Mon, Nov 3". */
function whenLabel(day, now) {
  if (day === localDay(now)) return 'Today';
  if (day === localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Yesterday';
  const weekday = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  return `${weekday}, ${dayLabel(day, now)}`;
}

const row = ({ kind, count, xp, capped }, commitsPerDay) =>
  h(
    'div',
    { class: 'log-row' },
    h(
      'div',
      {},
      h('b', {}, REASONS[kind](count)),
      capped ? h('span', { class: 'meta' }, `Only the first ${commitsPerDay} of the day count`) : null,
    ),
    h('b', { class: 'xp-text' }, `+${xp}`),
  );

const dayBlock = ({ day, xp, lines }, { now, commitsPerDay }) =>
  h(
    'section',
    { class: 'log-day' },
    h(
      'div',
      { class: 'log-day-head' },
      h('span', { class: 'eyebrow' }, whenLabel(day, now)),
      h('span', { class: 'fig' }, `+${xp} XP`),
    ),
    ...lines.map((line) => row(line, commitsPerDay)),
  );

/** @param {{ rules: object, rerender: (options?: { focus?: string }) => void, now?: Date }} options */
export function historyPage({ xpLog, lastSyncedAt }, { rules, rerender, now = new Date() }) {
  const toggle = (label) =>
    h(
      'button',
      {
        class: 'link',
        type: 'button',
        id: 'rules-toggle',
        dataset: { key: 'rules' },
        onclick: () => {
          rulesOpen = !rulesOpen;
          rerender({ focus: 'rules', resetScroll: true });
        },
      },
      label,
    );
  // The rules take the place of the log, and a link brings it back.
  if (rulesOpen) {
    return h(
      'div',
      { class: 'log-page' },
      h('div', { class: 'log-intro' }, h('p', {}, 'How XP works.'), toggle('Back to the log')),
      xpRules(rules),
    );
  }
  return h(
    'div',
    { class: 'log-page' },
    h('div', { class: 'log-intro' }, h('p', {}, 'What you earned, and why.'), toggle('How XP works')),
    xpLog.length
      ? xpLog.map((entry) => dayBlock(entry, { now, commitsPerDay: rules.commitsPerDay }))
      : h('p', { class: 'log-empty' }, 'No XP yet. Open a PR, review one or get one merged to earn it.'),
    h('p', { class: 'meta log-foot' }, lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt)}` : 'Not synced yet'),
  );
}
