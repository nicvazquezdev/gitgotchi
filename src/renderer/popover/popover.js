// PR popover: the pet's header and two tabs. "To review" is the queue of PRs waiting for the user's review;
// "My PRs" is the user's own PRs (waiting, approved, merged today). Rows open the PR in the browser.
import { $, h } from '../shared/dom.js';
import { plural, timeAgo } from '../shared/format.js';
import { icon, xpBar, portraitImg } from '../shared/ui.js';

const api = window.gitgotchi.popover;
const app = $('#app');

const NOTICE_MOODS = ['anxious'];
const STALE_AFTER_DAYS = 2; // a PR that has waited this long stands out (same threshold as the anxious mood)
const TABS = ['review', 'mine'];

const days = (n) => (n > 0 ? plural(n, 'day') : 'today');
const shortAge = (n) => (n > 0 ? `${n}d` : 'today');

// The last state received, and the tab the user picked (null: the default, see `currentTab`).
let latest = {};
let picked = null;

/** To review when something waits for the user (it is the part they can act on), else My PRs. */
function currentTab({ status } = latest) {
  if (picked) return picked;
  return status?.reviewQueue?.length ? 'review' : 'mine';
}

// ---------- Header ----------

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

// ---------- Tabs ----------

function tabs(status) {
  const mine = status.prs ?? { waiting: [], approved: [] };
  // `null`: the queue has not been fetched yet, so there is no number to show.
  const counts = { review: status.reviewQueue?.length ?? null, mine: mine.waiting.length + mine.approved.length };
  const labels = { review: 'To review', mine: 'My PRs' };
  const active = currentTab({ status });

  const select = (tab) => {
    picked = tab;
    render(latest, { resetScroll: true });
    $(`#tab-${tab}`)?.focus();
  };
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    select(TABS[(TABS.indexOf(active) + step + TABS.length) % TABS.length]);
  };

  return h(
    'div',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Pull requests', onkeydown: onKey },
    TABS.map((tab) =>
      h(
        'button',
        {
          id: `tab-${tab}`,
          class: 'tab',
          type: 'button',
          role: 'tab',
          'aria-selected': String(tab === active),
          'aria-controls': 'panel',
          tabIndex: tab === active ? 0 : -1,
          onclick: () => select(tab),
        },
        labels[tab],
        counts[tab] != null && h('span', { class: 'count-chip' }, counts[tab]),
      ),
    ),
  );
}

// ---------- Rows ----------

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
const xpText = (pr, suffix = 'XP') => (pr.xp ? `+${pr.xp} ${suffix}` : null);

function section(title, prs, render) {
  if (!prs.length) return null;
  return h(
    'section',
    { class: 'prs' },
    h('div', { class: 'section-title eyebrow' }, title, h('span', { class: 'count-chip' }, prs.length)),
    ...prs.map(render),
  );
}

// ---------- Tab contents ----------

function reviewTab(queue) {
  if (queue === null) return h('p', { class: 'empty' }, 'Looking for review requests…');
  if (!queue.length) {
    return h(
      'div',
      { class: 'empty calm' },
      h('span', { class: 'empty-icon' }, icon('check', { size: 18, stroke: 3 })),
      h('div', {}, h('strong', {}, 'All caught up'), h('div', { class: 'meta' }, 'Nobody is waiting for your review.')),
    );
  }
  const earned = queue[0].xp;
  return h(
    'section',
    { class: 'prs' },
    h('div', { class: 'list-note meta' }, `Oldest first · each review gives +${earned} XP`),
    ...queue.map((pr) =>
      prRow(pr, {
        badge: sizeBadge(pr),
        meta: [repoRef(pr), pr.author].filter(Boolean).join(' · '),
        end: shortAge(pr.ageDays),
        endClass: pr.ageDays >= STALE_AFTER_DAYS ? 'stale' : 'quiet',
      }),
    ),
  );
}

function minePrsTab({ waiting, approved, mergedToday }) {
  if (!waiting.length && !approved.length && !mergedToday.length) {
    return h('p', { class: 'empty' }, 'No open PRs. Nothing of yours is waiting.');
  }
  return h(
    'div',
    {},
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
  );
}

// ---------- Footer ----------

/**
 * To review has a main action: open the oldest request. My PRs has none: its rows already open each PR.
 * "View profile" is always there (alone, it takes the whole row).
 */
function footer(tab, { reviewQueue }) {
  const [oldest] = reviewQueue ?? [];
  const profile = h(
    'button',
    {
      class: `btn sm pixel-cut${tab === 'review' ? '' : ' grow'}`,
      type: 'button',
      onclick: () => api.action('openProfile'),
    },
    'View profile',
  );
  if (tab !== 'review') return h('div', { class: 'actions' }, profile);
  return h(
    'div',
    { class: 'actions' },
    h(
      'button',
      {
        class: 'btn primary sm pixel-cut grow',
        type: 'button',
        disabled: !oldest,
        onclick: () => api.action('reviewOldest'),
      },
      oldest ? `Review oldest · ${shortAge(oldest.ageDays)}` : 'Review oldest',
    ),
    profile,
  );
}

// ---------- Render ----------

/** `resetScroll`: start at the top of the list (another tab, or the popover reopened); a sync keeps the scroll. */
function render(state = latest, { resetScroll = false } = {}) {
  latest = state;
  const { status, placement = 'above', tailX = 180 } = state;
  const tab = currentTab(state);

  const card = h(
    'div',
    { class: 'card' },
    ...(status
      ? [
          header(status),
          tabs(status),
          h(
            'div',
            { class: 'list', id: 'panel', role: 'tabpanel', 'aria-labelledby': `tab-${tab}` },
            tab === 'review'
              ? reviewTab(status.reviewQueue ?? null)
              : [moodNotice(status), minePrsTab(status.prs ?? { waiting: [], approved: [], mergedToday: [] })],
          ),
          footer(tab, status),
        ]
      : [h('p', { class: 'empty' }, 'No pet yet. Pick your repos to hatch one.')]),
  );

  // The tail points at the pet: below the card when the popover is above the pet, above it otherwise.
  const tail = h('div', { class: 'tail-zone' }, h('i', { class: 'tail', style: { left: `${tailX}px` } }));
  const scroll = resetScroll ? 0 : ($('.list')?.scrollTop ?? 0);
  app.className = `wrap ${placement}`;
  app.replaceChildren(card, tail);
  const list = $('.list');
  if (list) list.scrollTop = scroll;
}

// ---------- Boot ----------

// Every time the popover is reopened, the default tab and the top of the list apply again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  picked = null;
  render(latest, { resetScroll: true });
});

// The window height follows the content (card plus tail).
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);

api.onState((state) => render(state));
api.state().then((state) => render(state));
