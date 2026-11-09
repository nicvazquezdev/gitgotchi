// The card of the pet: its header (level, one bar and what is left) and, under it, the tab that is open. Four tabs at
// the bottom: Home (how it will grow and how the week went, the one it opens on), Pets, Trophies and the XP log.
// The card lives inside a little creature (the shell) whose eyes show how the pet feels.
import { $, h } from '../shared/dom.js';
import { icon, xpBar } from '../shared/ui.js';
import { vacationUntilText } from '../shared/vacation-text.js';
import { PetView } from '../pet/pet-view.js';
import { growth, week, streak } from './overview.js';
import { petsPage, leavePets } from './pets-view.js';
import { trophiesPage, leaveTrophies } from './trophies-view.js';
import { historyPage, leaveHistory } from './history-view.js';
import { stopRenaming } from './rename.js';

const gitgotchi = window.gitgotchi;
const api = gitgotchi.popover;
const { catalog } = await gitgotchi.bootstrap(); // the level that unlocks each form, the pets and the rules of XP
const app = $('#app');

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

// The last state received.
let latest = {};

// ---------- Tabs ----------

const TABS = ['home', 'pets', 'trophies', 'xp'];
const LABELS = { home: 'Home', pets: 'Pets', trophies: 'Trophies', xp: 'XP log' };
const [hashTab, hashPick] = location.hash.slice(1).split('/'); // e.g. #pets/koi: that pet on show (for screenshots)
let tab = TABS.includes(hashTab) ? hashTab : 'home';

/** Opens a tab. */
function openTab(name) {
  if (name === tab) return;
  leave();
  tab = name;
  render(latest, { resetScroll: true, focus: `tab-${name}` });
}

/** Leaving a tab: what was half done in it is dropped. */
function leave() {
  if (tab === 'pets') leavePets();
  if (tab === 'trophies') leaveTrophies();
  if (tab === 'xp') leaveHistory();
  stopRenaming();
}

function tabs() {
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const at = TABS.indexOf(document.activeElement?.dataset?.tab);
    $(`#tab-${TABS[(at + step + TABS.length) % TABS.length]}`)?.focus();
  };
  return h(
    'div',
    { class: 'tabs', role: 'tablist', 'aria-label': 'Collection', onkeydown: onKey },
    TABS.map((name) =>
      h(
        'button',
        {
          id: `tab-${name}`,
          class: 'tab',
          type: 'button',
          role: 'tab',
          'aria-selected': String(name === tab),
          dataset: { key: `tab-${name}`, tab: name },
          onclick: () => openTab(name),
        },
        LABELS[name],
      ),
    ),
  );
}

/** What is above the tabs: the one that is open. */
function content(status) {
  const rerender = (options) => render(latest, options);
  if (tab === 'pets') return petsPage(status, { catalog, api: gitgotchi, pick: hashPick, rerender });
  if (tab === 'trophies') return trophiesPage(status, { rerender });
  if (tab === 'xp') return historyPage(status, { rules: catalog.xpRules, rerender });
  return [growth(status, catalog.stages), week(status), streak(status)]; // home
}

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
          'div',
          { class: 'head-actions' },
          h(
            'button',
            {
              class: 'icon-btn',
              type: 'button',
              'aria-label': 'Share your pet',
              onclick: () => api.action('openShare'),
            },
            icon('share', { size: 18 }),
          ),
          h(
            'button',
            { class: 'icon-btn', type: 'button', 'aria-label': 'Settings', onclick: () => api.action('openSettings') },
            icon('gear', { size: 18 }),
          ),
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

/** On vacation, the card says until when and offers the way back. */
function vacationBanner(pause) {
  if (!pause?.active) return null;
  return h(
    'div',
    { class: 'banner' },
    icon('pause', { size: 16, stroke: 2.4 }),
    h(
      'span',
      { class: 'banner-text' },
      h('b', {}, `On vacation ${vacationUntilText(pause)}`),
      h('span', { class: 'meta' }, 'Streak safe'),
    ),
    h('button', { class: 'link', type: 'button', onclick: () => api.action('resume') }, "I'm back"),
  );
}

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

// ---------- Render ----------

/** What has the focus (a tab, a card, a name field), to give it back after the card is drawn again. */
const focusKey = () => document.activeElement?.dataset?.key ?? null;
function restoreFocus(key) {
  const el = key && $(`[data-key="${CSS.escape(key)}"]`);
  if (!el) return;
  el.focus();
  if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); // typing goes on at the end
}

/**
 * `resetScroll`: start at the top (another tab, or the popover reopened); a sync keeps the scroll.
 * `focus`: the data-key of what gets the focus after drawing; by default what had it before.
 */
function render(state = latest, { resetScroll = false, focus: focusOn } = {}) {
  const focus = focusOn ?? focusKey();
  latest = state;
  const { status, placement = 'above' } = state;
  if (status) syncPortrait(status);
  const mood = status?.pause?.active ? 'paused' : (status?.mood ?? 'neutral'); // what the eyes of the shell show

  const card = h(
    'div',
    { class: 'card' },
    ...(status
      ? [header(status), vacationBanner(status.pause), h('div', { class: 'card-body' }, content(status)), tabs()]
      : [h('p', { class: 'empty' }, 'No pet yet. Pick your repos to hatch one.')]),
  );

  const scroll = resetScroll ? 0 : ($('.card-body')?.scrollTop ?? 0);
  app.className = `wrap ${placement}`; // the notch of the shell points at the pet: down when above it, up when below
  app.replaceChildren(h('div', { class: 'rig', 'data-mood': mood }, shell(), card));
  const body = $('.card-body');
  if (body) body.scrollTop = scroll;
  restoreFocus(focus);
}

// ---------- Boot ----------

// Every time the popover is reopened, it starts at Home again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  leave();
  tab = 'home';
  render(latest, { resetScroll: true });
});

// The window height follows the content (the shell with the card).
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);

api.onState((state) => render(state));
api.state().then((state) => render(state));
