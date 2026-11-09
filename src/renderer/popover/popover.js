// The card of the pet: its header (level, one bar and what is left) and two tabs. "My PRs" is the user's own (waiting,
// approved, merged today) and opens first; "To review" is the queue of PRs that wait for the user's review. Rows open
// the PR in the browser. The card lives inside a little creature (the shell) whose eyes show how the pet feels.
import { $, h } from '../shared/dom.js';
import { timeAgo } from '../shared/format.js';
import { icon, xpBar } from '../shared/ui.js';
import { pauseUntilText } from '../shared/pause-text.js';
import { PetView } from '../pet/pet-view.js';

const api = window.gitgotchi.popover;
const app = $('#app');

const TABS = ['mine', 'review'];

const shortAge = (n) => (n > 0 ? `${n}d` : 'today');
const ago = (n) => (n > 0 ? `${n}d ago` : 'today');
/** 'acme/code' -> 'code' when the team is in the same organization as the repo (it is the usual case). */
const teamName = (pr) => (pr.via?.startsWith(`${pr.fullRepo.split('/')[0]}/`) ? pr.via.split('/')[1] : pr.via);

// ---------- Portrait: the pet playing its mood ----------

// One canvas for the life of the page: the card is rebuilt on every state, and a new animator each time would restart
// its effects. The pet is not on the desktop in this mood (there it is always normal), so this is where it shows:
// the mood's pose, standing in place.
// The creature is drawn at 2 CSS px per native px and the frame fits it, so it grows with each stage: the creature's
// rows, plus 2 above for its hop and 2 under the floor line (the canvas is bottom-aligned, the rest is clipped).
const PORTRAIT_SCALE = 2;
const PORTRAIT_MARGIN = 4; // native rows
const FRAME_BORDER = 2; // CSS px, each side (see .portrait)
const portraitInner = ({ species, stage }) => (species.stages[stage.index].size + PORTRAIT_MARGIN) * PORTRAIT_SCALE;
let portraitWidth = 0; // CSS px the canvas may use: the frame's inside
const portraitCanvas = h('canvas', { class: 'sprite', role: 'img' });
const portrait = new PetView(portraitCanvas, { getWidth: () => portraitWidth });
portrait.setScale(PORTRAIT_SCALE);
portrait.setStill(true);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const syncCalm = () => portrait.setCalm(reducedMotion.matches); // the pose, without effects
syncCalm();
reducedMotion.addEventListener('change', syncCalm);

let portraitCreature = null;
function syncPortrait(status) {
  const { species, stage, mood, moodLabel } = status;
  if (portrait.mood !== mood) portrait.setMood(mood); // it restarts the mood's effects: only when it changes
  portraitCanvas.ariaLabel = `${species.stages[stage.index].name}, ${moodLabel.toLowerCase()}`;
  const creature = `${species.id}:${stage.index}`;
  if (creature === portraitCreature) return;
  portraitCreature = creature;
  portraitWidth = portraitInner(status);
  portrait.setCreature(species.id, stage.index).catch((err) => console.error(err));
}

// The last state received, and the tab the user picked (null: the default, My PRs).
let latest = {};
let picked = null;

/** The popover always opens on My PRs; the count on To review says when something waits for the user. */
const currentTab = () => picked ?? 'mine';

// ---------- Header ----------

/** The next level is an evolution: then what is left is "to evolve". */
const evolvesNext = ({ nextStage, level }) => nextStage?.level === level + 1;

function header(status) {
  const { name, level, levelXp, levelXpNeeded, todayXp } = status;
  const frame = `${portraitInner(status) + 2 * FRAME_BORDER}px`;
  return h(
    'div',
    { class: 'head' },
    h(
      'div',
      { class: 'portrait pixel-cut', style: { width: frame, height: frame } },
      h('div', { class: 'inner pixel-cut' }, portraitCanvas),
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
          {
            class: 'icon-btn',
            type: 'button',
            'aria-label': 'Menu',
            onclick: () => api.action('openMenu'),
          },
          icon('dots', { size: 18 }),
        ),
      ),
      h('div', { class: 'level' }, `Level ${level}`),
      xpBar(levelXp / levelXpNeeded),
      h(
        'div',
        { class: 'caption' },
        h(
          'span',
          {},
          h('b', { class: 'num' }, String(levelXpNeeded - levelXp)),
          evolvesNext(status) ? ' XP to evolve' : ` XP to level ${level + 1}`,
        ),
        todayXp > 0 ? h('span', { class: 'today' }, `+${todayXp} today`) : null,
      ),
    ),
  );
}

/** While paused, the card says until when and offers the way back. */
function pauseBanner(pause) {
  if (!pause?.active) return null;
  return h(
    'div',
    { class: 'banner' },
    icon('pause', { size: 16, stroke: 2.4 }),
    h(
      'span',
      { class: 'banner-text' },
      h('b', {}, `Paused ${pauseUntilText(pause)}`),
      h('span', { class: 'meta' }, 'Streak safe · no alerts'),
    ),
    h('button', { class: 'link', type: 'button', onclick: () => api.action('resume') }, 'Resume'),
  );
}

// ---------- Tabs ----------

function tabs(status) {
  const mine = status.prs ?? { waiting: [], approved: [] };
  // `null`: the queue has not been fetched yet, so there is no number to show.
  const counts = { review: status.reviewQueue?.length ?? null, mine: mine.waiting.length + mine.approved.length };
  const labels = { review: 'To review', mine: 'My PRs' };
  const active = currentTab();

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
 * One PR row: a dot for what it needs, the title (up to two lines: a tooltip would open behind the card, which floats
 * above everything), the reason in bold and where (repo, author), and on the right how long it has waited (hovering
 * swaps it for the "open" icon).
 */
function prRow(pr, { dot = '', reason, where, end, done = false }) {
  return h(
    'button',
    { class: 'need', type: 'button', onclick: () => api.openPullRequest(pr.url) },
    h('span', { class: `dot ${dot}` }),
    h(
      'span',
      { class: 'need-body' },
      h('span', { class: `need-title${done ? ' done' : ''}` }, pr.title),
      h('span', { class: 'need-meta' }, h('b', {}, reason), ` · ${where}`),
    ),
    end ? h('span', { class: 'need-age' }, end) : null,
    h('span', { class: 'need-open' }, icon('external', { size: 14 })),
  );
}

const repoRef = (pr) => `${pr.repo} #${pr.number}`;
// Broken first (they need the author), then the rest in the order they come.
const PROBLEMS = ['failing', 'conflicts', 'changes'];
const byProblem = (a, b) => PROBLEMS.includes(b.status?.kind) - PROBLEMS.includes(a.status?.kind);
const DOTS = { failing: 'failing', conflicts: 'failing', ready: 'approved' };

function section(title, prs, render) {
  if (!prs.length) return null;
  return h('section', { class: 'prs' }, h('div', { class: 'section-title eyebrow' }, title), ...prs.map(render));
}

// ---------- Tab contents ----------

const starter = () =>
  h(
    'p',
    { class: 'starter' },
    h('b', {}, 'Your pet is just getting started.'),
    ' Open a PR, review one or get one merged to earn XP.',
    h('button', { class: 'link', type: 'button', onclick: () => api.action('openXp') }, 'How XP works'),
  );

const allClear = (text) =>
  h(
    'div',
    { class: 'clear' },
    h('span', { class: 'tick' }, icon('check', { size: 18, stroke: 3 })),
    h('div', {}, h('b', {}, 'All clear'), h('span', { class: 'meta' }, text)),
  );

/** A pet that has earned nothing yet is told how to start; otherwise nothing is waiting, and that is news too. */
const nothing = (status, text) => (status.xp === 0 ? starter() : allClear(text));

function reviewTab(status) {
  const queue = status.reviewQueue ?? null;
  if (queue === null) return h('p', { class: 'empty' }, 'Looking for review requests…');
  if (!queue.length) return nothing(status, 'Nobody is waiting for your review.');
  return h(
    'section',
    { class: 'prs' },
    ...queue.map((pr) => {
      // The wait counts from when the user was asked. When that date could not be proved, say how old the PR is
      // instead: it would be a guess to show it as a wait.
      const known = pr.waitingDays !== null;
      const where = [repoRef(pr), pr.author, pr.via && `via ${teamName(pr)}`, !known && `opened ${ago(pr.ageDays)}`];
      return prRow(pr, {
        dot: 'waiting',
        reason: 'Review requested',
        where: where.filter(Boolean).join(' · '),
        end: known ? shortAge(pr.waitingDays) : null,
      });
    }),
  );
}

function minePrsTab(status) {
  const { waiting, approved, mergedToday } = status.prs ?? { waiting: [], approved: [], mergedToday: [] };
  if (!waiting.length && !approved.length && !mergedToday.length) {
    return nothing(status, 'None of your PRs is open.');
  }
  const flagged = (pr) => PROBLEMS.includes(pr.status?.kind) || pr.status?.kind === 'running';
  return h(
    'div',
    {},
    section('Waiting for review', [...waiting].sort(byProblem), (pr) =>
      prRow(pr, {
        dot: DOTS[pr.status?.kind] ?? 'waiting',
        reason: flagged(pr) ? pr.status.label : 'Waiting for review',
        where: repoRef(pr),
        end: shortAge(pr.ageDays),
      }),
    ),
    section('Approved', approved, (pr) =>
      prRow(pr, {
        dot: DOTS[pr.status?.kind] ?? 'approved',
        reason: pr.status?.kind === 'ready' ? 'Ready to merge' : (pr.status?.label ?? 'Approved'),
        where: repoRef(pr),
      }),
    ),
    section('Merged today', mergedToday, (pr) =>
      prRow(pr, { reason: 'Merged', where: `${repoRef(pr)} · ${timeAgo(pr.mergedAt)}`, done: true }),
    ),
  );
}

// ---------- Footer ----------

/** The card has no main action: its rows open each PR. Only the way to the pet page. */
const footer = () =>
  h(
    'div',
    { class: 'card-foot' },
    h(
      'button',
      { class: 'foot-btn', type: 'button', onclick: () => api.action('openProfile') },
      'Pet page',
      icon('chevron', { size: 14, stroke: 2.5 }),
    ),
  );

// ---------- Shell ----------

const layer = (cls) => h('i', { class: cls });

/** The creature around the card: ears, eyes, feet. Only drawing, the CSS puts every piece where the design has it. */
const shell = () =>
  h(
    'div',
    { class: 'decor', ariaHidden: 'true' },
    h('div', { class: 'silhouette' }, layer('ear-l-out'), layer('ear-r-out'), layer('body-out')),
    layer('ear-l'),
    layer('ear-l-in'),
    layer('ear-r'),
    layer('ear-r-in'),
    layer('foot-out l'),
    layer('foot-out r'),
    layer('foot l'),
    layer('foot r'),
    layer('body'),
    layer('eye l'),
    layer('eye r'),
    layer('belly-a'),
    layer('belly-b'),
    layer('belly-c'),
  );

// ---------- Fit ----------

const LIST_MIN = 110; // px: the list never gets shorter than two rows and a bit

/**
 * The shell makes the popover tall. When the screen has less `room` than the card needs, the list gives way (it
 * scrolls anyway): everything else keeps its size.
 */
function fitList(room) {
  const list = $('.list');
  if (!list) return;
  list.style.maxHeight = ''; // back to the natural cap of the stylesheet
  if (room == null) return;
  const other = app.getBoundingClientRect().height - list.getBoundingClientRect().height;
  const natural = Number.parseFloat(getComputedStyle(list).maxHeight);
  const fits = Math.floor(room - other);
  if (fits < natural) list.style.maxHeight = `${Math.max(LIST_MIN, fits)}px`;
}

// ---------- Render ----------

/** `resetScroll`: start at the top of the list (another tab, or the popover reopened); a sync keeps the scroll. */
function render(state = latest, { resetScroll = false } = {}) {
  latest = state;
  const { status, placement = 'above', tailX = 180, room } = state;
  const tab = currentTab();
  if (status) syncPortrait(status);
  const mood = status?.pause?.active ? 'paused' : (status?.mood ?? 'neutral'); // what the eyes of the shell show

  const card = h(
    'div',
    { class: 'card' },
    ...(status
      ? [
          header(status),
          pauseBanner(status.pause),
          tabs(status),
          h(
            'div',
            { class: 'list', id: 'panel', role: 'tabpanel', 'aria-labelledby': `tab-${tab}` },
            tab === 'review' ? reviewTab(status) : minePrsTab(status),
          ),
          footer(),
        ]
      : [h('p', { class: 'empty' }, 'No pet yet. Pick your repos to hatch one.')]),
  );

  // The tail points at the pet: below the card when the popover is above the pet, above it otherwise.
  const tail = h('div', { class: 'tail-zone' }, h('i', { class: 'tail', style: { left: `${tailX}px` } }));
  const scroll = resetScroll ? 0 : ($('.list')?.scrollTop ?? 0);
  app.className = `wrap ${placement}`;
  app.replaceChildren(h('div', { class: 'rig', 'data-mood': mood }, shell(), card), tail);
  fitList(room);
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
