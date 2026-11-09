// The pet page: one page that reads top to bottom (who the pet is, how far it is from the next level, how it will
// grow, how the week went). Pets and Trophies are two views you go into and come back from, and the rules of XP are a
// sheet that opens on request.
import { $, h } from '../shared/dom.js';
import { icon, spriteImg, xpBar } from '../shared/ui.js';
import { timeAgo } from '../shared/format.js';
import { glyph } from '../shared/pixel-art.js';
import { animatePet } from '../shared/sprite.js';
import { petsPage, leavePets } from './pets-view.js';
import { trophiesPage, leaveTrophies } from './trophies-view.js';
import { nameLine, stopRenaming } from './rename.js';
import { xpSheet } from './xp-sheet.js';
import { shareDialog } from './share-card.js';

const api = window.gitgotchi;
let catalog = null;
let stopAnimation = () => {};

/** Animates a canvas; the previous animation of the page stops (there is one pet on show at a time). */
function animate(canvas, getOptions) {
  stopAnimation();
  stopAnimation = animatePet(canvas, getOptions);
}

const PORTRAIT_MAX = 170; // px: biggest sprite in the hero (integer scale of its native size)
const portraitScale = (size) => Math.max(2, Math.floor(PORTRAIT_MAX / size));

// ---------- Home ----------

function petCanvas({ species, stage, mood }) {
  const size = species.stages[stage.index].size;
  const canvas = h('canvas', { class: 'sprite', style: { width: `${size * portraitScale(size)}px` } });
  animate(canvas, () => ({ species, stageIndex: stage.index, mood }));
  return canvas;
}

/** The pet on its night, with the way to the two views and to sharing. */
function hero(status) {
  const { hatched, total } = status.collection;
  const { unlocked, total: trophies } = status.achievements;
  const glass = (label, count, view) =>
    h(
      'button',
      { class: 'glass', type: 'button', dataset: { key: view }, onclick: () => show(view) },
      label,
      h('span', { class: 'n' }, count),
    );
  return h(
    'section',
    { class: 'hero night' },
    h(
      'div',
      { class: 'hero-actions' },
      glass('Pets', `${hatched}/${total}`, 'pets'),
      glass('Trophies', `${unlocked}/${trophies}`, 'trophies'),
      h(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          id: 'share-open',
          title: 'Copy a card of your pet as an image',
          'aria-label': 'Share your pet',
          onclick: openShare,
        },
        icon('share', { size: 18 }),
      ),
    ),
    petCanvas(status),
  );
}

let problem = null; // what went wrong with the last rename

/** The name (with its pencil), what it is, and the level as a big figure. */
function idRow(status) {
  const entry = status.collection.entries.find((e) => e.active);
  const rename = async (name) => {
    const result = await api.pets.rename({ species: entry.id, name });
    problem = result?.error ? result.message : null;
    if (result?.error) render(latest, { focus: 'name' });
    return !result?.error;
  };
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'id-row' },
      h(
        'div',
        { class: 'id-who' },
        nameLine({
          entry,
          nameMax: catalog.nameMax ?? 16,
          headingClass: 'id-name',
          rename,
          rerender: (options) => render(latest, options),
        }),
        h('div', { class: 'id-sub' }, `${status.species.stages[status.stage.index].name} · ${status.species.line}`),
      ),
      h('div', { class: 'lvl' }, h('small', {}, 'Level'), h('b', {}, String(status.level))),
    ),
    problem ? h('p', { class: 'problem', role: 'alert' }, problem) : null,
  );
}

/** One bar to the next level, and what is left (the next level is an evolution: then it is "to evolve"). */
function progress({ level, levelXp, levelXpNeeded, nextStage, todayXp }) {
  const evolves = nextStage?.level === level + 1;
  return [
    xpBar(levelXp / levelXpNeeded, 'lg'),
    h(
      'div',
      { class: 'caption' },
      h(
        'span',
        {},
        h('b', { class: 'num' }, String(levelXpNeeded - levelXp)),
        evolves ? ' XP to evolve' : ` XP to level ${level + 1}`,
      ),
      todayXp > 0 ? h('span', { class: 'today' }, `+${todayXp} today`) : null,
    ),
  ];
}

const section = (title, body, aside = null) =>
  h(
    'section',
    { class: 'sect' },
    h('div', { class: 'sect-head' }, h('span', { class: 'eyebrow' }, title), aside),
    body,
  );

/** The line of forms: the ones reached, the one it is in, and the ones still hidden (a silhouette and their level). */
function stageTile(stage, i, current) {
  const state = i === current ? 'now' : i < current ? 'done' : 'locked';
  const art =
    state === 'locked'
      ? spriteImg(stage.silhouette, stage.size, 1, '')
      : spriteImg(stage.file, stage.size, 1, stage.name);
  return h(
    'div',
    { class: `stage ${state}` },
    state === 'now'
      ? h('div', { class: 'portrait pixel-cut' }, h('div', { class: 'inner pixel-cut' }, art))
      : h('div', { class: 'night pixel-cut' }, art),
    h(
      'div',
      { class: state === 'locked' ? 'nm dim' : 'nm' },
      state === 'locked' ? `Lv ${catalog.stages[i].level}` : stage.name,
    ),
  );
}

function growth({ species, stage }) {
  const tiles = species.stages.map((s, i) => stageTile(s, i, stage.index));
  const line = tiles.flatMap((tile, i) =>
    i ? [h('span', { class: 'arrow' }, icon('chevron', { size: 16, stroke: 2.5 })), tile] : [tile],
  );
  return section('Growth', h('div', { class: 'growth' }, line));
}

const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
const BAR_MAX = 44; // px: the tallest day

/** XP of each of the last 7 days as bars, the week's total and the streak. */
function weekBlock({ week, history, streak }) {
  const top = Math.max(1, ...history.map((d) => d.score));
  return section(
    'This week',
    [
      h(
        'div',
        { class: 'week', title: 'Everything you did, whichever pet was earning it' },
        history.map(({ day, score }, i) =>
          h(
            'div',
            { class: 'day', title: `${weekday(day)}: +${score} XP` },
            h('div', {
              class: `bar${score ? '' : ' none'}${i === history.length - 1 ? ' today' : ''}`,
              style: { height: `${score ? Math.max(6, (score / top) * BAR_MAX) : 4}px` },
            }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'week-days' },
        history.map(({ day }, i) => h('small', { class: i === history.length - 1 ? 'today' : '' }, weekday(day))),
      ),
      h(
        'div',
        { class: 'streak' },
        glyph('flame', 2),
        streak > 0 ? `${streak}-day streak` : 'No streak yet. Ship something today.',
      ),
    ],
    h('span', { class: 'fig' }, `+${week.total} XP`),
  );
}

function footer({ lastSyncedAt }) {
  return h(
    'div',
    { class: 'page-foot' },
    h('button', { class: 'link', type: 'button', id: 'sheet-open', onclick: openSheet }, 'How XP works'),
    h('span', { class: 'meta' }, lastSyncedAt ? `Synced ${timeAgo(lastSyncedAt)}` : 'Not synced yet'),
  );
}

function home(status) {
  return [
    hero(status),
    h('div', { class: 'page' }, idRow(status), ...progress(status), growth(status), weekBlock(status), footer(status)),
  ];
}

// ---------- Views ----------

const VIEWS = ['home', 'pets', 'trophies'];
const TITLES = { pets: 'Pets', trophies: 'Trophies' };
const [hashView, hashPick] = location.hash.slice(1).split('/'); // e.g. #pets/koi: that pet on show
let view = VIEWS.includes(hashView) ? hashView : 'home';
let latest = null; // the last status received
let shownView = null; // the view on screen
let sharing = false; // the share dialog is open
let sheet = false; // the rules of XP are open

/** Goes to another view (a button of the page, or the back arrow). */
function show(next) {
  if (next !== view) {
    if (view === 'pets') leavePets();
    if (view === 'trophies') leaveTrophies();
    stopRenaming();
    problem = null;
  }
  const from = view;
  view = next;
  // The keyboard goes with the person: into the view (to its back arrow), and back to the button that opened it.
  render(latest, { focus: next === 'home' ? from : 'back' });
}

/** The bar of a view you went into: back, its name and how many there are. */
function titleBar(status) {
  if (view === 'home') return [];
  const { hatched, total } = status.collection;
  const { unlocked, total: trophies } = status.achievements;
  return [
    h(
      'button',
      {
        class: 'icon-btn back',
        type: 'button',
        title: 'Back',
        'aria-label': 'Back to the pet page',
        dataset: { key: 'back' },
        onclick: () => show('home'),
      },
      icon('back', { size: 18 }),
    ),
    TITLES[view],
    h('span', { class: 'right' }, view === 'pets' ? `${hatched} of ${total}` : `${unlocked} of ${trophies}`),
  ];
}

// ---------- Share and the rules of XP: dialogs over the page ----------

/** Asks main to copy the card on screen (its rectangle) to the clipboard as an image. */
function copyCard(card) {
  const { x, y, width, height } = card.getBoundingClientRect();
  return api.profile.copyCard({ x, y, width, height });
}

/** The dialog that is open, if any. The page behind is inert: the keyboard stays inside the dialog. */
function renderOverlay() {
  $('#overlay').replaceChildren(
    ...(sharing && latest ? [shareDialog({ status: latest, copy: copyCard, close: closeShare })] : []),
    ...(sheet && catalog ? [xpSheet(catalog.xpRules, { close: closeSheet })] : []),
  );
  $('.window').inert = sharing || sheet;
}

function openShare() {
  sharing = true;
  renderOverlay();
  $('#share-copy')?.focus();
}

function closeShare() {
  sharing = false;
  renderOverlay();
  $('#share-open')?.focus();
}

function openSheet() {
  sheet = true;
  renderOverlay();
  $('#sheet-close')?.focus();
}

function closeSheet() {
  sheet = false;
  renderOverlay();
  $('#sheet-open')?.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (sheet) closeSheet();
  else if (sharing) closeShare();
  else if (view !== 'home') show('home');
});

// ---------- Render ----------

/** What has the focus (a card, a name field), to give it back after the page is drawn again. */
const focusKey = () => document.activeElement?.dataset?.key ?? null;
function restoreFocus(key) {
  const el = key && $(`[data-key="${CSS.escape(key)}"]`);
  if (!el) return;
  el.focus();
  if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); // typing goes on at the end
}

/** `focus`: what to give the focus to after drawing (the data-key of an element); by default what had it before. */
function render(status, { focus: focusOn } = {}) {
  latest = status;
  const app = $('#app');
  const switched = shownView !== view;
  const scroll = switched ? 0 : app.scrollTop; // a status update keeps the place in the page
  const focus = focusOn ?? (switched ? null : focusKey());
  shownView = view;
  const bar = titleBar(status);
  $('#title').hidden = view === 'home';
  $('#title').replaceChildren(...bar);
  app.className = `content ${view}`;
  if (view === 'home') {
    app.replaceChildren(...home(status));
  } else {
    stopAnimation(); // the pet is not on screen
    app.replaceChildren(
      view === 'pets'
        ? petsPage(status, { catalog, api, pick: hashPick, rerender: (options) => render(latest, options) })
        : trophiesPage(status, { rerender: (options) => render(latest, options) }),
    );
  }
  app.scrollTop = scroll;
  restoreFocus(focus);
  if (sharing) renderOverlay(); // the card follows the status
}

async function init() {
  const boot = await api.bootstrap();
  catalog = boot.catalog;
  const open = (asked) => {
    if (asked === 'xp') sheet = true;
    else if (asked === 'pets' || asked === 'trophies') view = asked;
  };
  open(await api.profile.view()); // what the window was opened on (the card's "How XP works", say)
  api.profile.onStatus((status) => render(status));
  api.profile.onView((asked) => {
    open(asked);
    if (asked === 'xp') renderOverlay();
    else show(VIEWS.includes(asked) ? asked : 'home'); // asked again while it is open
  });
  render(boot.status ?? (await api.profile.status()));
  renderOverlay();
}

init();
