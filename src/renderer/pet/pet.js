import { $, h, replayClass } from '../shared/dom.js';
import { plural, oldestDays } from '../shared/format.js';
import { animatePet, spriteRect, BOX } from '../shared/sprite.js';

const { pet: api } = window.gitgotchi;
const canvas = $('#pet');
const root = document.documentElement.style;
const DRAG_THRESHOLD_PX = 4;

const LINES = {
  happy: ['What a week! 🔥', 'Yum, fresh pushes!', 'I feel huge today', 'Keep it up!'],
  idle: ['All quiet here', 'One more PR?', "I'm a little hungry…", 'A push would be nice'],
  sad: ["I'm hungry… 🥺", "You haven't pushed in a while", 'I miss your PRs', 'A review would cheer me up'],
  sleeping: ['Zzz…', 'Five more minutes…'],
};

let status = null;
let prefs = { speechBubbles: true, doNotDisturb: false };
let drag = null;
let spoken = null; // the line being said right now: { title, sub, dot }
let bubbleTimer = null;
let waitingVisible = false; // the PR reminder is only up for a moment, so the pet never nags
let waitingTimer = null;
let waitingCount = null;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** The creature for the current stage, e.g. { name: 'Chispín', size: 36, ... }. */
const creature = () => status.species.stages[status.stage.index];

// ---------- Render ----------

function setStatus(next) {
  if (!next) return;
  const moodChanged = status && status.mood !== next.mood;
  status = next;
  const count = status.prs?.waiting?.length ?? 0;
  if (count !== waitingCount) {
    waitingCount = count;
    if (count > 0) showWaiting(); // first status or the number changed
  }
  // Native sprite size of the current stage: CSS places the bubble and indicators around it.
  root.setProperty('--stage-size', creature().size);
  $('#zzz').hidden = status.mood !== 'sleeping';
  $('#alert').hidden = !status.error;
  if (moodChanged) say(pick(LINES[status.mood] ?? LINES.idle));
  else renderBubble();
}

const spriteOptions = () => status && { species: status.species, stageIndex: status.stage.index, mood: status.mood };

const setSize = (px) => root.setProperty('--pet-size', `${px}px`);

// ---------- Bubble ----------
// A card with a dot, a bold line and a secondary line. It only speaks for a moment: mood changes, live reactions,
// and the PR reminder (when the number of PRs waiting changes; click to see them).
// Off with Speech bubbles or Do not disturb.

const quiet = () => !prefs.speechBubbles || prefs.doNotDisturb;

/** The standing message: PRs waiting for review. */
function waitingMessage() {
  const waiting = status?.prs?.waiting ?? [];
  if (!waiting.length) return null;
  const days = oldestDays(waiting);
  return {
    title: `${plural(waiting.length, 'PR')} waiting for review`,
    sub: `${days > 0 ? `For ${plural(days, 'day')}` : 'Opened today'}. Click me to see them.`,
    dot: 'waiting',
  };
}

function renderBubble() {
  const bubble = $('#bubble');
  const message = quiet() ? null : (spoken ?? (waitingVisible ? waitingMessage() : null));
  bubble.hidden = !message;
  if (!message) return;
  const key = `${message.title}|${message.sub}`;
  if (bubble.dataset.key === key) return; // unchanged: don't replay the pop-in
  bubble.dataset.key = key;
  bubble.replaceChildren(
    h('div', { class: 'bubble-title' }, h('span', { class: `dot ${message.dot ?? ''}` }), message.title),
    message.sub ? h('div', { class: 'bubble-sub' }, message.sub) : null,
  );
  replayClass(bubble, 'bubble');
}

/** Shows the PR reminder for a few seconds. */
function showWaiting(ms = 5000) {
  waitingVisible = true;
  renderBubble();
  clearTimeout(waitingTimer);
  waitingTimer = setTimeout(() => {
    waitingVisible = false;
    renderBubble();
  }, ms);
}

/** Says a line for a moment; the standing message comes back afterwards. */
function say(title, { sub, dot, ms = 3500 } = {}) {
  spoken = { title, sub, dot };
  renderBubble();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    spoken = null;
    renderBubble();
  }, ms);
}

/** Opens the PR popover above the creature (a second click closes it). */
function openPopover() {
  const r = canvas.getBoundingClientRect();
  const scale = r.width / BOX;
  const { x, y, size } = spriteRect(status.species, status.stage.index);
  api.openPopover({ x: r.left + x * scale, y: r.top + y * scale, width: size * scale, height: size * scale });
}

function reactToClick() {
  if (!status) return;
  replayClass(canvas, 'jump');
  openPopover();
}

// ---------- Live reactions (new GitHub activity) ----------

// Most exciting first. `anim` is a CSS class on the pet, `fx` the particle style.
const REACTIONS = [
  { kind: 'merges', anim: 'party', fx: 'confetti', text: 'PR merged! 🎉', dot: 'approved' },
  { kind: 'prs', anim: 'jump', fx: 'sparkle', text: 'A new PR! Go go go!', dot: 'waiting' },
  { kind: 'reviews', anim: 'wiggle', fx: 'sparkle', text: 'Nice review!', dot: 'approved' },
  { kind: 'issues', anim: 'wiggle', text: 'Issue noted!' },
  { kind: 'comments', anim: 'wiggle', text: 'Chatty today!' },
  { kind: 'pushes', anim: 'hop', text: 'Nom nom, a push!' },
];
const FX_COLORS = ['var(--accent)', 'var(--dot-waiting)', 'var(--dot-approved)', 'var(--accent-text)', 'var(--fx-red)'];
let fxTimer = null;

function burst(style) {
  const count = style === 'confetti' ? 14 : 6;
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
  replayClass(canvas, reaction.anim);
  if (reaction.fx) burst(reaction.fx);
  say(count > 1 ? `${reaction.text} x${count}` : reaction.text, { dot: reaction.dot, ms: 4000 });
}

// ---------- Mouse: hover, click and drag ----------
// The canvas is a 52 px box (room for the adult); only the creature itself counts as "the pet",
// so the transparent rest of the box lets clicks through to the windows behind.

function isOverPet(e) {
  if (!status) return false;
  const r = canvas.getBoundingClientRect();
  const scale = r.width / BOX; // screen px per native px
  const { x, y, size } = spriteRect(status.species, status.stage.index);
  const nx = (e.clientX - r.left) / scale;
  const ny = (e.clientY - r.top) / scale;
  return nx >= x && nx < x + size && ny >= y - 2 && ny < y + size; // -2: room for the hop
}

const isOverBubble = (e) => {
  const bubble = $('#bubble');
  if (bubble.hidden) return false;
  const r = bubble.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
};

function setHover(active) {
  if (document.body.classList.contains('hover') === active) return;
  document.body.classList.toggle('hover', active);
  api.setClickThrough(!active);
}

// With click-through on, Electron still forwards mouse moves, so hover keeps working.
document.addEventListener('mousemove', (e) => !drag && setHover(isOverPet(e) || isOverBubble(e)));
document.addEventListener('mouseleave', () => !drag && setHover(false));

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !isOverPet(e)) return;
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.screenX, y: e.screenY, moved: false };
  api.dragStart({ offsetX: e.clientX, offsetY: e.clientY });
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.moved) return;
  if (Math.hypot(e.screenX - drag.x, e.screenY - drag.y) > DRAG_THRESHOLD_PX) {
    drag.moved = true;
    document.body.classList.add('dragging');
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  api.dragEnd();
  const wasClick = !drag.moved;
  drag = null;
  document.body.classList.remove('dragging');
  if (wasClick) reactToClick();
  setHover(isOverPet(e) || isOverBubble(e));
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
  say(`${status?.name ?? 'Your pet'} evolved into ${creature().name}! ✨`, { ms: 6000 });
});
api.onActivity(reactToActivity);
api.onPrefs((next) => {
  prefs = next;
  renderBubble();
});
api.onPopoverRequest(() => status && openPopover());

setSize(await api.size());
prefs = await api.prefs();
setStatus(await api.status());
animatePet(canvas, spriteOptions);
if (status && !waitingMessage()) say(`Hi! I'm ${status.name}`);
