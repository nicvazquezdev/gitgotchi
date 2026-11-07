// PR popover: the pet's header, its mood and the PRs that need attention. Rows open the PR in the browser.
import { $, h } from '../shared/dom.js';
import { plural, timeAgo } from '../shared/format.js';
import { icon, xpBar, portraitImg } from '../shared/ui.js';

const api = window.gitgotchi.popover;
const app = $('#app');

const MAX_ROWS = 5; // per section; the rest is summarized
const NOTICE_MOODS = ['anxious', 'sad'];

const days = (n) => (n > 0 ? plural(n, 'day') : 'today');

// ---------- Parts ----------

function header({ name, species, stage, level, levelXp, levelXpNeeded }) {
  return h(
    'div',
    { class: 'head' },
    h(
      'div',
      { class: 'portrait pixel-cut' },
      h('div', { class: 'inner pixel-cut', style: { background: species.tint } }, portraitImg({ species, stage })),
    ),
    h(
      'div',
      { class: 'head-body' },
      h(
        'div',
        { class: 'head-title' },
        h('span', { class: 'pixel-name name' }, name),
        h(
          'button',
          { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: () => api.action('openSettings') },
          icon('gear', { size: 18 }),
        ),
      ),
      h('div', { class: 'stage-line' }, `${stage.name} · Level ${level}`),
      xpBar(levelXp / levelXpNeeded),
      h(
        'div',
        { class: 'xp-row' },
        h('b', {}, `${levelXp} / ${levelXpNeeded} XP`),
        h('span', { class: 'meta' }, `${levelXpNeeded - levelXp} XP to level ${level + 1}`),
      ),
    ),
  );
}

const moodNotice = ({ mood, moodLabel, moodReason }) =>
  NOTICE_MOODS.includes(mood) && moodReason
    ? h(
        'div',
        { class: 'notice' },
        icon('clock', { stroke: 2.2 }),
        h('span', {}, h('strong', {}, moodLabel), ` · ${moodReason}`),
      )
    : null;

/**
 * One PR row. `badge` is the left chip, `meta` the second line, `end` the right-hand text.
 * Hovering swaps the end text for the "open" icon.
 */
function prRow(pr, { badge, meta, end, endClass = 'xp-text', done = false }) {
  return h(
    'button',
    { class: 'pr', type: 'button', title: pr.title, onclick: () => api.openPullRequest(pr.url) },
    badge,
    h(
      'span',
      { class: 'pr-body' },
      h('span', { class: `pr-title${done ? ' done' : ''}` }, pr.title),
      h('span', { class: 'meta' }, meta),
    ),
    end ? h('span', { class: `pr-end ${endClass}` }, end) : null,
    h('span', { class: 'pr-open' }, icon('external')),
  );
}

const sizeBadge = (pr) => h('span', { class: 'size-badge' }, pr.size ?? 'M');
const doneBadge = () => h('span', { class: 'size-badge done' }, icon('check', { size: 14, stroke: 3 }));
const repoRef = (pr) => `${pr.repo} #${pr.number}`;

function section(title, prs, render) {
  if (!prs.length) return null;
  return h(
    'section',
    { class: 'prs' },
    h('div', { class: 'section-title eyebrow' }, title, h('span', { class: 'count-chip' }, prs.length)),
    ...prs.slice(0, MAX_ROWS).map(render),
    prs.length > MAX_ROWS ? h('div', { class: 'meta more' }, `+${prs.length - MAX_ROWS} more`) : null,
  );
}

const xpText = (pr, suffix = 'XP') => (pr.xp ? `+${pr.xp} ${suffix}` : null);

function footer(waiting) {
  return h(
    'div',
    { class: 'actions' },
    h(
      'button',
      {
        class: 'btn primary sm pixel-cut grow',
        type: 'button',
        disabled: !waiting.length,
        onclick: () => api.action('nudgeReviewers'),
      },
      'Nudge reviewers',
    ),
    h(
      'button',
      { class: 'btn sm pixel-cut', type: 'button', onclick: () => api.action('openProfile') },
      'View profile',
    ),
  );
}

// ---------- Render ----------

function render({ status, placement = 'above', tailX = 180 } = {}) {
  const prs = status?.prs ?? { waiting: [], approved: [], mergedToday: [] };
  const { waiting, approved, mergedToday } = prs;
  const empty = !waiting.length && !approved.length && !mergedToday.length;

  const card = h(
    'div',
    { class: 'card' },
    ...(status
      ? [
          header(status),
          moodNotice(status),
          section('Waiting for review', waiting, (pr) =>
            prRow(pr, { badge: sizeBadge(pr), meta: `${repoRef(pr)} · ${days(pr.ageDays)}`, end: xpText(pr) }),
          ),
          section('Approved', approved, (pr) =>
            prRow(pr, {
              badge: sizeBadge(pr),
              meta: `${repoRef(pr)} · ready to merge`,
              end: xpText(pr, 'on merge'),
              endClass: 'success',
            }),
          ),
          section('Merged today', mergedToday, (pr) =>
            prRow(pr, {
              badge: doneBadge(),
              meta: `${repoRef(pr)} · ${timeAgo(pr.mergedAt)}`,
              end: xpText(pr),
              endClass: 'quiet',
              done: true,
            }),
          ),
          empty ? h('p', { class: 'empty' }, 'No open PRs. Nothing is waiting for you.') : null,
          footer(waiting),
        ]
      : [h('p', { class: 'empty' }, 'No pet yet. Pick your repos to hatch one.')]),
  );

  // The tail points at the pet: below the card when the popover is above the pet, above it otherwise.
  const tail = h('div', { class: 'tail-zone' }, h('i', { class: 'tail', style: { left: `${tailX}px` } }));
  app.className = `wrap ${placement}`;
  app.replaceChildren(card, tail);
}

// ---------- Boot ----------

// The window height follows the content (card plus tail).
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);

api.onState(render);
api.state().then(render);
