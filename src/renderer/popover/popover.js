// PR popover: the pet's header and two tabs. "To review" is the queue of PRs waiting for the user's review;
// "My PRs" is the user's own PRs (waiting, approved, merged today). Rows open the PR in the browser.
import { $, h } from '../shared/dom.js';
import { plural, timeAgo, dayLabel } from '../shared/format.js';
import { icon, xpBar } from '../shared/ui.js';
import { ring } from '../shared/pixel-art.js';
import { PetView } from '../pet/pet-view.js';

const api = window.gitgotchi.popover;
const app = $('#app');

const NOTICE_MOODS = ['anxious'];
const STALE_AFTER_DAYS = 2; // a PR that has waited this long stands out (same threshold as the anxious mood)
const TABS = ['review', 'mine'];

const days = (n) => (n > 0 ? plural(n, 'day') : 'today');
const shortAge = (n) => (n > 0 ? `${n}d` : 'today');
const ago = (n) => (n > 0 ? `${n}d ago` : 'today');
/** 'acme/code' -> 'code' when the team is in the same organization as the repo (it is the usual case). */
const teamName = (pr) => (pr.via?.startsWith(`${pr.fullRepo.split('/')[0]}/`) ? pr.via.split('/')[1] : pr.via);

// ---------- Portrait: the pet playing its mood ----------

// One canvas for the life of the page: the card is rebuilt on every state, and a new animator each time would restart
// the sweat and the shivers. The pet is not on the desktop in this mood (there it is always normal), so this is where
// it shows: the mood's pose and effects, standing in place, at the same size as the desktop's smallest scale.
const PORTRAIT_INNER = 60; // CSS px inside the frame (see .portrait: 64 px less its 2 px border)
const portraitCanvas = h('canvas', { class: 'sprite', role: 'img' });
const portrait = new PetView(portraitCanvas, { getWidth: () => PORTRAIT_INNER });
portrait.setScale(1);
portrait.setStill(true);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const syncCalm = () => portrait.setCalm(reducedMotion.matches); // the pose, without sweat or shivers
syncCalm();
reducedMotion.addEventListener('change', syncCalm);

let portraitCreature = null;
function syncPortrait({ species, stage, mood, moodLabel }) {
  if (portrait.mood !== mood) portrait.setMood(mood); // it restarts the mood's effects: only when it changes
  portraitCanvas.ariaLabel = `${species.stages[stage.index].name}, ${moodLabel.toLowerCase()}`;
  const creature = `${species.id}:${stage.index}`;
  if (creature === portraitCreature) return;
  portraitCreature = creature;
  portrait.setCreature(species.id, stage.index).catch((err) => console.error(err));
}

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
      h('div', { class: 'inner pixel-cut', style: { background: species.tint } }, portraitCanvas),
    ),
    h(
      'div',
      { class: 'head-body' },
      h(
        'div',
        { class: 'head-title' },
        h('span', { class: 'pixel-name name' }, name),
        h(
          'span',
          { class: 'head-actions' },
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              'aria-label': 'Companions',
              title: 'Switch companion',
              onclick: () => api.action('openCollection'),
            },
            icon('swap', { size: 18 }),
          ),
          h(
            'button',
            { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: () => api.action('openSettings') },
            icon('gear', { size: 18 }),
          ),
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

/** Why the pet looks the way it does (only for the moods that need an explanation), under the portrait. */
const moodNotice = ({ mood, moodLabel, moodReason }) =>
  NOTICE_MOODS.includes(mood) && moodReason
    ? h(
        'div',
        { class: 'notice' },
        icon('clock', { stroke: 2.2 }),
        h('span', {}, h('strong', {}, moodLabel), ` · ${moodReason}`),
      )
    : null;

// ---------- Today: the daily goal ----------

/**
 * Today's XP against the daily goal, a typical working day of the person. It is a nudge: a weekend or a day of time
 * off has no goal (and says the streak is safe), and nothing is lost by not reaching it.
 */
function todayRow({ daily, timeOff }) {
  if (!daily) return null;
  const text = (title, sub) => h('div', { class: 'today-text' }, h('b', {}, title), h('div', { class: 'meta' }, sub));
  const goalRing = (progress, done) =>
    h(
      'span',
      { class: `goal-ring${done ? ' done' : ''}`, role: 'img', ariaLabel: `${daily.xp} XP today` },
      ring(progress, 2),
    );

  if (daily.rest && daily.xp === 0) {
    const [title, sub] = timeOff?.active
      ? [
          'On time off',
          timeOff.backOn ? `Back on ${dayLabel(timeOff.backOn)}. Your streak is safe.` : 'Your streak is safe.',
        ]
      : ['Rest day', 'No goal today. Your streak is safe.'];
    return h(
      'div',
      { class: 'today' },
      h('span', { class: 'today-icon' }, icon('moon', { size: 18, stroke: 2.2 })),
      text(title, sub),
    );
  }
  if (daily.rest) {
    return h('div', { class: 'today' }, goalRing(1, true), text(`+${daily.xp} XP today`, 'A bonus: it is a rest day'));
  }
  const progress = Math.min(1, daily.xp / daily.goal);
  return daily.reached
    ? h(
        'div',
        { class: 'today reached' },
        goalRing(1, true),
        text('Daily goal reached', `${daily.xp} XP today · a typical day is ${daily.goal}`),
      )
    : h(
        'div',
        { class: 'today' },
        goalRing(progress, false),
        text(`${daily.xp} / ${daily.goal} XP today`, `${daily.goal - daily.xp} XP to your daily goal`),
      );
}

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
function prRow(pr, { badge, meta, end, endClass = 'xp-text', endTitle, done = false }) {
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
    end ? h('span', { class: `pr-end ${endClass}`, title: endTitle }, end) : null,
    h('span', { class: 'pr-open' }, icon('external')),
  );
}

// The left chip says what the PR needs: a state icon, never an unexplained letter. The size is spelled out in the text.
const STATUS_ICONS = { changes: 'alert', failing: 'x', ready: 'check', running: 'clock', review: 'clock' };
const statusBadge = (pr) =>
  h(
    'span',
    { class: `badge ${pr.status?.kind ?? 'review'}`, title: pr.status?.label },
    icon(STATUS_ICONS[pr.status?.kind] ?? 'clock', { size: 14, stroke: 2.6 }),
  );
const doneBadge = () => h('span', { class: 'badge ready' }, icon('check', { size: 14, stroke: 3 }));
const queueBadge = () => h('span', { class: 'badge review' }, icon('search', { size: 14, stroke: 2.6 }));

const FLAGGED = ['changes', 'failing', 'running']; // states worth a line of their own

/**
 * Detail lines: the fast-review bonus while it lasts, the PR's state when it needs attention (each on its own line),
 * then repo, size and the rest.
 */
function metaLine(pr, ...rest) {
  const flag = FLAGGED.includes(pr.status?.kind) ? pr.status : null;
  const text = [repoRef(pr), pr.sizeName ?? 'Medium', ...rest].filter(Boolean).join(' · ');
  return [
    pr.fastBonus
      ? h(
          'span',
          { class: 'flag bonus', title: 'Review it within an hour of the request for the bonus' },
          `Fast bonus +${pr.fastXp} XP`,
        )
      : null,
    flag ? h('span', { class: `flag ${flag.kind}` }, flag.label) : null,
    text,
  ];
}
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
    h(
      'div',
      { class: 'list-note meta' },
      `Oldest request first · +${earned} XP each, +${queue[0].fastXp} more within an hour`,
    ),
    ...queue.map((pr) => {
      // The wait counts from when the user was asked. When that date could not be proved, say how old the PR is
      // instead, and do not flag it as late: it would be a guess.
      const known = pr.waitingDays !== null;
      return prRow(pr, {
        badge: queueBadge(),
        meta: metaLine(pr, pr.author, pr.via && `via ${teamName(pr)}`, !known && `opened ${ago(pr.ageDays)}`),
        end: known ? shortAge(pr.waitingDays) : null,
        endClass: pr.waitingDays >= STALE_AFTER_DAYS ? 'stale' : 'quiet',
        endTitle: known ? `Asked ${ago(pr.waitingDays)}${pr.via ? ` through ${pr.via}` : ''}` : undefined,
      });
    }),
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
      prRow(pr, {
        badge: statusBadge(pr),
        meta: metaLine(pr, days(pr.ageDays)),
        end: xpText(pr),
      }),
    ),
    section('Approved', approved, (pr) =>
      prRow(pr, {
        badge: statusBadge(pr),
        meta: metaLine(pr),
        end: xpText(pr, 'on merge'),
        endClass: 'success',
      }),
    ),
    section('Merged today', mergedToday, (pr) =>
      prRow(pr, {
        badge: doneBadge(),
        meta: `${repoRef(pr)} · ${pr.sizeName ?? 'Medium'} · ${timeAgo(pr.mergedAt)}`,
        end: xpText(pr),
        endClass: 'quiet',
        done: true,
      }),
    ),
  );
}

// ---------- Footer ----------

/** The popover has no main action: its rows already open each PR. Only the way to the profile. */
const footer = () =>
  h(
    'div',
    { class: 'actions' },
    h(
      'button',
      { class: 'btn sm pixel-cut grow', type: 'button', onclick: () => api.action('openProfile') },
      'View profile',
    ),
  );

// ---------- Render ----------

/** `resetScroll`: start at the top of the list (another tab, or the popover reopened); a sync keeps the scroll. */
function render(state = latest, { resetScroll = false } = {}) {
  latest = state;
  const { status, placement = 'above', tailX = 180 } = state;
  const tab = currentTab(state);
  if (status) syncPortrait(status);

  const card = h(
    'div',
    { class: 'card' },
    ...(status
      ? [
          header(status),
          moodNotice(status),
          todayRow(status),
          tabs(status),
          h(
            'div',
            { class: 'list', id: 'panel', role: 'tabpanel', 'aria-labelledby': `tab-${tab}` },
            tab === 'review'
              ? reviewTab(status.reviewQueue ?? null)
              : minePrsTab(status.prs ?? { waiting: [], approved: [], mergedToday: [] }),
          ),
          footer(),
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
