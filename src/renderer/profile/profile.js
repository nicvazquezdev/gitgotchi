// The collection: your pets, your trophies and the XP you earned (what and why). One window with three views you move
// between with the tabs; the rules of XP are a sheet that opens on request, and sharing a card of your pet is a dialog.
import { $, h } from '../shared/dom.js';
import { icon } from '../shared/ui.js';
import { petsPage, leavePets } from './pets-view.js';
import { trophiesPage, leaveTrophies } from './trophies-view.js';
import { historyPage } from './history-view.js';
import { stopRenaming } from './rename.js';
import { xpSheet } from './xp-sheet.js';
import { shareDialog } from './share-card.js';

const api = window.gitgotchi;
let catalog = null;

const VIEWS = ['pets', 'trophies', 'xp'];
const LABELS = { pets: 'Pets', trophies: 'Trophies', xp: 'XP' };
const [hashView, hashPick] = location.hash.slice(1).split('/'); // e.g. #pets/koi: that pet on show
let view = VIEWS.includes(hashView) ? hashView : 'pets';
let latest = null; // the last status received
let shownView = null; // the view on screen
let sharing = false; // the share dialog is open
let sheet = false; // the rules of XP are open

// ---------- Title bar and tabs ----------

/** The name of the window, and the way to share a card of the active pet. */
function titleBar() {
  $('#title').replaceChildren(
    h('span', {}, 'Collection'),
    h(
      'button',
      {
        class: 'icon-btn share',
        type: 'button',
        id: 'share-open',
        title: 'Copy a card of your pet as an image',
        'aria-label': 'Share your pet',
        onclick: openShare,
      },
      icon('share', { size: 18 }),
    ),
  );
}

/** How many there are of what each view lists. */
function counts({ collection, achievements }) {
  return {
    pets: `${collection.hatched}/${collection.total}`,
    trophies: `${achievements.unlocked}/${achievements.total}`,
  };
}

function tabs(status) {
  const count = counts(status);
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    show(VIEWS[(VIEWS.indexOf(view) + step + VIEWS.length) % VIEWS.length], { focus: true });
  };
  $('#tabs').onkeydown = onKey;
  $('#tabs').replaceChildren(
    ...VIEWS.map((name) =>
      h(
        'button',
        {
          class: 'tab',
          type: 'button',
          role: 'tab',
          id: `tab-${name}`,
          'aria-selected': String(name === view),
          tabIndex: name === view ? 0 : -1,
          dataset: { key: `tab-${name}` },
          onclick: () => show(name),
        },
        LABELS[name],
        count[name] ? h('span', { class: 'count-chip' }, count[name]) : null,
      ),
    ),
  );
}

/** Goes to another view. `focus`: the keyboard moves with the tab (arrow keys). */
function show(next, { focus = false } = {}) {
  if (next !== view) {
    if (view === 'pets') leavePets();
    if (view === 'trophies') leaveTrophies();
    stopRenaming();
  }
  view = next;
  render(latest, { focus: focus ? `tab-${next}` : null });
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
  tabs(status);
  app.className = `content ${view}`;
  const rerender = (options) => render(latest, options);
  app.replaceChildren(
    view === 'pets'
      ? petsPage(status, { catalog, api, pick: hashPick, rerender })
      : view === 'trophies'
        ? trophiesPage(status, { rerender })
        : historyPage(status, { openSheet, commitsPerDay: catalog.xpRules.commitsPerDay }),
  );
  app.scrollTop = scroll;
  restoreFocus(focus);
  if (sharing) renderOverlay(); // the card follows the status
}

async function init() {
  const boot = await api.bootstrap();
  catalog = boot.catalog;
  const asked = await api.profile.view(); // what the window was opened on (the card's "XP log", say)
  if (VIEWS.includes(asked)) view = asked;
  titleBar();
  api.profile.onStatus((status) => render(status));
  api.profile.onView((next) => show(VIEWS.includes(next) ? next : 'pets')); // asked again while it is open
  render(boot.status ?? (await api.profile.status()));
  renderOverlay();
}

init();
