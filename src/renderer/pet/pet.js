import { $, h, replayClass } from '../shared/dom.js';
import { PetView, PX_PER_SCALE } from './pet-view.js';
import { medal } from '../shared/pixel-art.js';

const { pet: api } = window.gitgotchi;
const canvas = $('#pet');
const root = document.documentElement.style;
const DRAG_THRESHOLD_PX = 4;

// The canvas sets its own size in whole native pixels; the stage (and the CSS that places the bubble) follows it.
const view = new PetView(canvas, {
  getWidth: () => document.documentElement.clientWidth,
  onLayout: ({ width, height }) => {
    root.setProperty('--stage-w', `${width}px`);
    root.setProperty('--stage-h', `${height}px`);
  },
});
// Reduce Motion (macOS accessibility) and a vacation: the pet only idles (no walks, cheers or particles).
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const paused = () => Boolean(status?.pause?.active);
const calm = () => reducedMotion.matches || paused();
const syncCalm = () => view.setCalm(calm());
reducedMotion.addEventListener('change', syncCalm);

let status = null;
let prefs = { speechBubbles: true };
let drag = null;
let spoken = null; // the line being said right now: { title, sub, dot }
let momentTimer = null; // a moment (a level, a trophy) is on screen: it takes the place of the speech bubble
let bubbleTimer = null;
let popoverOpen = false; // the popover hangs from the creature: it takes the place of the speech bubble
let loading = Promise.resolve(); // the creature on screen is being swapped for another one

/** The creature for the current stage, e.g. { name: 'Chispín', size: 36, ... }. */
const creature = () => status.species.stages[status.stage.index];

// ---------- Render ----------

function setStatus(next) {
  if (!next) return;
  const creatureChanged = !status || status.species.id !== next.species.id || status.stage.index !== next.stage.index;
  const gained = status && status.species.id === next.species.id ? next.xp - status.xp : 0;
  status = next;
  syncCalm(); // a vacation starts or ends
  // The pet on the desktop is always in its normal state: how it feels shows in the eyes of the card's shell.
  if (creatureChanged) {
    loading = view.setCreature(status.species.id, status.stage.index).catch((err) => console.error(err));
  }
  // Native sprite size of the current stage: CSS places the bubble and indicators around it.
  root.setProperty('--stage-size', creature().size);
  $('#alert').hidden = !status.error;
  if (gained > 0 && !paused()) floatXp(gained);
  renderBubble();
}

function setSize(px) {
  root.setProperty('--pet-size', `${px}px`);
  view.setScale(Math.round(px / PX_PER_SCALE));
}

// ---------- Bubble ----------
// A card with a dot and one line (and sometimes a second one). It only speaks for a moment, to react to what just
// happened (a merge, an approval, a hatch). Off with Speech bubbles or during a vacation.

const quiet = () => !prefs.speechBubbles || paused();

function renderBubble() {
  const bubble = $('#bubble');
  const message = quiet() || momentTimer || popoverOpen ? null : spoken;
  bubble.hidden = !message;
  if (!message) return;
  const key = `${message.title}|${message.sub}`;
  if (bubble.dataset.key === key) return; // unchanged: don't replay the pop-in
  bubble.dataset.key = key;
  bubble.replaceChildren(
    h('div', { class: 'bubble-title' }, h('span', { class: `dot ${message.dot ?? ''}` }), message.title),
    // Not `null`: replaceChildren turns it into the text "null".
    ...(message.sub ? [h('div', { class: 'bubble-sub' }, message.sub)] : []),
  );
  replayClass(bubble, 'bubble');
}

/** Says a line for a moment. */
function say(title, { sub, dot, ms = 3500 } = {}) {
  spoken = { title, sub, dot };
  renderBubble();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    spoken = null;
    renderBubble();
  }, ms);
}

// ---------- XP and moments ----------

/** "+10 XP" that rises over the pet and fades. */
function floatXp(gained) {
  const el = h('div', { class: 'float' }, `+${gained} XP`);
  $('#float').append(el);
  setTimeout(() => el.remove(), 1600);
}

/**
 * One pill for every good thing that happens (a new level, a trophy): an icon, a short text, a few seconds. It takes
 * the place of the speech bubble while it is up. `tier` colors the ring of a medal.
 */
function showMoment({ text, icon, tier = 'special' }, ms = 4000) {
  const moment = $('#moment');
  moment.className = `moment tier-${tier}`;
  moment.replaceChildren(...(icon ? [h('span', { class: 'moment-icon' }, icon)] : []), h('span', {}, text));
  moment.hidden = false;
  replayClass(moment, 'moment');
  clearTimeout(momentTimer);
  momentTimer = setTimeout(() => {
    momentTimer = null;
    moment.hidden = true;
    renderBubble();
  }, ms);
  renderBubble();
}

/** Opens the PR popover above the creature (a second click closes it). */
function openPopover() {
  const bounds = view.bounds();
  if (bounds) api.openPopover(bounds);
}

function reactToClick() {
  if (status) openPopover();
}

// ---------- Live reactions (new GitHub activity) ----------

// Most exciting first. `cheer`: the pet's cheer animation; otherwise `anim` is a CSS class on the pet, `fx` the particle style.
const REACTIONS = [
  { kind: 'merges', cheer: true, text: 'PR merged!', dot: 'approved' },
  { kind: 'approvals', cheer: true, text: 'Your PR got approved!', dot: 'approved' },
  { kind: 'readyToMerge', anim: 'jump', fx: 'sparkle', text: 'Your PR is ready to merge!', dot: 'approved' },
  { kind: 'changesRequested', anim: 'wiggle', text: 'Changes requested on your PR', dot: 'waiting' },
  { kind: 'checksFailed', anim: 'wiggle', text: 'Checks failed on your PR', dot: 'waiting' },
  { kind: 'mergeConflicts', anim: 'wiggle', text: 'Merge conflicts on your PR', dot: 'waiting' },
  { kind: 'prs', anim: 'jump', fx: 'sparkle', text: 'A new PR! Go go go!', dot: 'waiting' },
  { kind: 'reviews', anim: 'wiggle', fx: 'sparkle', text: 'Nice review!', dot: 'approved' },
  { kind: 'issues', anim: 'wiggle', text: 'Issue noted!' },
  { kind: 'comments', anim: 'wiggle', text: 'Chatty today!' },
  { kind: 'pushes', anim: 'hop', text: 'Nom nom, a push!' },
];
const FX_COLORS = ['var(--accent)', 'var(--dot-waiting)', 'var(--dot-approved)', 'var(--accent-text)', 'var(--fx-red)'];
let fxTimer = null;

function burst(style) {
  const count = 6;
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI + Math.PI; // upper half-circle
    const dist = 11 + (i % 3) * 4; // sprite pixels
    const particle = h('i', { class: `particle ${style}`, style: { background: FX_COLORS[i % FX_COLORS.length] } });
    // Custom properties need setProperty (Object.assign on style ignores them).
    particle.style.setProperty('--x', Math.round(Math.cos(angle) * dist));
    particle.style.setProperty('--y', Math.round(Math.sin(angle) * dist));
    return particle;
  });
  $('#fx').replaceChildren(...particles);
  clearTimeout(fxTimer);
  fxTimer = setTimeout(() => $('#fx').replaceChildren(), 1400);
}

/** Shows only the most exciting reaction for a delta like `{ merges: 1, pushes: 3 }`. */
function reactToActivity(delta) {
  const reaction = REACTIONS.find((r) => delta[r.kind] > 0);
  if (!reaction) return;
  const count = delta[reaction.kind];
  if (!calm()) {
    if (reaction.cheer) view.celebrate();
    else {
      replayClass(canvas, reaction.anim);
      if (reaction.fx) burst(reaction.fx);
    }
  }
  say(count > 1 ? `${reaction.text} x${count}` : reaction.text, { sub: reaction.sub, dot: reaction.dot, ms: 4000 });
}

/** New achievements: the cheer, then one pill with the medal of the first one (the rest are in the Trophies tab of the card). */
function celebrateAchievements(list) {
  if (!list?.length) return;
  if (!calm()) view.celebrate();
  const [first] = list;
  showMoment({
    text: list.length > 1 ? `${list.length} new trophies` : first.name,
    icon: medal(first.icon, 1),
    tier: first.tier ?? 'bronze',
  });
}

// ---------- Mouse: hover, click and drag ----------
// Only the creature itself counts as "the pet" (wherever it walks to), so the transparent rest of the canvas
// lets clicks through to the windows behind. While the pointer is on it or it is held, it does not walk away.

const isOverPet = (e) => view.contains(e.clientX, e.clientY);

const isOverBubble = (e) => {
  const bubble = $('#bubble');
  if (bubble.hidden) return false;
  const r = bubble.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
};

// The pet stands still while the pointer is on it or it is being dragged.
const syncStill = () => view.setStill(document.body.classList.contains('hover') || Boolean(drag));

function setHover(active) {
  if (document.body.classList.contains('hover') === active) return;
  document.body.classList.toggle('hover', active);
  api.setClickThrough(!active);
  syncStill();
}

// With click-through on, Electron still forwards mouse moves, so hover keeps working.
document.addEventListener('mousemove', (e) => !drag && setHover(isOverPet(e) || isOverBubble(e)));
document.addEventListener('mouseleave', () => !drag && setHover(false));

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !isOverPet(e)) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.screenX, y: e.screenY, moved: false, lastX: e.screenX, lastTime: e.timeStamp };
  view.squish.press();
  syncStill();
  api.dragStart({ offsetX: e.clientX, offsetY: e.clientY });
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.moved) {
    if (Math.hypot(e.screenX - drag.x, e.screenY - drag.y) <= DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    document.body.classList.add('dragging');
    view.squish.pickUp();
  }
  view.squish.drag(e.screenX - drag.lastX, e.timeStamp - drag.lastTime); // it swings with the speed of the cursor
  drag.lastX = e.screenX;
  drag.lastTime = e.timeStamp;
});

canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  api.dragEnd();
  const wasClick = !drag.moved;
  drag = null;
  document.body.classList.remove('dragging');
  if (wasClick) {
    view.squish.pop(); // boing
    reactToClick();
  } else view.squish.drop();
  setHover(isOverPet(e) || isOverBubble(e));
  syncStill();
});

$('#bubble').addEventListener('click', () => status && openPopover());

canvas.addEventListener('contextmenu', (e) => {
  if (!isOverPet(e)) return;
  e.preventDefault();
  api.openMenu();
});

// ---------- Main process events ----------

api.onSize(setSize);
api.onStatus(setStatus);
api.onEvolved(() => {
  replayClass(canvas, 'evolve');
  say(`${status?.name ?? 'Your pet'} evolved into ${creature().name}!`, { ms: 6000 });
});
api.onActivity(reactToActivity);
api.onAchievements(celebrateAchievements);
// A new level: a hop, sparkles and the pill (if it also evolves, the evolution that follows takes over).
api.onLevelUp(({ level }) => {
  if (!calm()) {
    replayClass(canvas, 'jump');
    burst('sparkle');
  }
  showMoment({ text: `Level ${level}`, icon: h('i', { class: 'spark' }), tier: 'gold' }, 3500);
});
// The user hatched a pet or switched to another one: it comes in out of a flash and says that it earns the XP now.
api.onCompanion(({ kind, name }) => {
  loading.then(() => !calm() && replayClass(canvas, 'swap'));
  say(kind === 'hatched' ? 'Hello, world!' : 'My turn!', {
    sub: `${name} earns all new XP now`,
    dot: 'approved',
    ms: 5000,
  });
});
api.onPrefs((next) => {
  prefs = next;
  syncCalm();
  renderBubble();
});
api.onPopoverRequest(() => status && openPopover());
api.onPopoverOpen((open) => {
  popoverOpen = open;
  if (open) {
    // The popover tells it all: what the bubble said does not come back when the popover closes.
    spoken = null;
  }
  renderBubble();
});

setSize(await api.size());
prefs = await api.prefs();
syncCalm();
setStatus(await api.status());
