// The card of the pet: its header (level, one bar and what is left), how it will grow, how the week went, and the way to
// its collection (pets, trophies, XP). The card lives inside a little creature (the shell) whose eyes show how the pet
// feels.
import { $, h } from '../shared/dom.js';
import { icon, xpBar } from '../shared/ui.js';
import { pauseUntilText } from '../shared/pause-text.js';
import { PetView } from '../pet/pet-view.js';
import { growth, week } from './overview.js';

const api = window.gitgotchi.popover;
const { catalog } = await window.gitgotchi.bootstrap(); // the level that unlocks each form
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
      h('span', { class: 'meta' }, 'Streak safe'),
    ),
    h('button', { class: 'link', type: 'button', onclick: () => api.action('resume') }, 'Resume'),
  );
}

// ---------- Footer ----------

/** The way to the collection: pets, trophies and the XP log, each one opens its view. */
function footer({ collection, achievements }) {
  const link = (label, count, action) =>
    h(
      'button',
      { class: 'foot-btn', type: 'button', onclick: () => api.action(action) },
      label,
      count ? h('span', { class: 'n' }, count) : null,
    );
  return h(
    'div',
    { class: 'card-foot' },
    link('Pets', `${collection.hatched}/${collection.total}`, 'openPets'),
    link('Trophies', `${achievements.unlocked}/${achievements.total}`, 'openTrophies'),
    link('XP log', null, 'openXp'),
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

// ---------- Fit ----------

const BODY_MIN = 140; // px: the body never gets shorter than the growth line and a bit

/**
 * The shell makes the popover tall. When the screen has less `room` than the card needs, the body gives way (it
 * scrolls): everything else keeps its size.
 */
function fitBody(room) {
  const body = $('.card-body');
  if (!body) return;
  body.style.maxHeight = ''; // back to the natural cap of the stylesheet
  if (room == null) return;
  const other = app.getBoundingClientRect().height - body.getBoundingClientRect().height;
  const natural = Number.parseFloat(getComputedStyle(body).maxHeight);
  const fits = Math.floor(room - other);
  if (fits < natural) body.style.maxHeight = `${Math.max(BODY_MIN, fits)}px`;
}

// ---------- Render ----------

/** `resetScroll`: start at the top (the popover reopened); a sync keeps the scroll. */
function render(state = latest, { resetScroll = false } = {}) {
  latest = state;
  const { status, placement = 'above', tailX = 180, room } = state;
  if (status) syncPortrait(status);
  const mood = status?.pause?.active ? 'paused' : (status?.mood ?? 'neutral'); // what the eyes of the shell show

  const card = h(
    'div',
    { class: 'card' },
    ...(status
      ? [
          header(status),
          pauseBanner(status.pause),
          h('div', { class: 'card-body' }, growth(status, catalog.stages), week(status)),
          footer(status),
        ]
      : [h('p', { class: 'empty' }, 'No pet yet. Pick your repos to hatch one.')]),
  );

  // The tail points at the pet: below the card when the popover is above the pet, above it otherwise.
  const tail = h('div', { class: 'tail-zone' }, h('i', { class: 'tail', style: { left: `${tailX}px` } }));
  const scroll = resetScroll ? 0 : ($('.card-body')?.scrollTop ?? 0);
  app.className = `wrap ${placement}`;
  app.replaceChildren(h('div', { class: 'rig', 'data-mood': mood }, shell(), card), tail);
  fitBody(room);
  const body = $('.card-body');
  if (body) body.scrollTop = scroll;
}

// ---------- Boot ----------

// Every time the popover is reopened, it starts at the top again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  render(latest, { resetScroll: true });
});

// The window height follows the content (card plus tail).
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);

api.onState((state) => render(state));
api.state().then((state) => render(state));
