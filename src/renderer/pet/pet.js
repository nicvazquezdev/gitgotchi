import { $, h, replayClass } from '../shared/dom.js';
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
let drag = null;
let bubbleTimer = null;

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** The creature for the current stage, e.g. { name: 'Chispín', size: 36, ... }. */
const creature = () => status.species.stages[status.stage.index];

// ---------- Render ----------

function setStatus(next) {
  if (!next) return;
  status = next;
  // Native sprite size of the current stage: CSS places the bubble and indicators around it.
  root.setProperty('--stage-size', creature().size);
  $('#zzz').hidden = status.mood !== 'sleeping';
  $('#alert').hidden = !status.error;
}

const spriteOptions = () => status && { species: status.species, stageIndex: status.stage.index, mood: status.mood };

const setSize = (px) => root.setProperty('--pet-size', `${px}px`);

// ---------- Bubble ----------

function say(text, ms = 3500) {
  const bubble = $('#bubble');
  bubble.textContent = text;
  bubble.hidden = false;
  replayClass(bubble, 'bubble');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => (bubble.hidden = true), ms);
}

function reactToClick() {
  if (!status) return;
  replayClass(canvas, 'jump');
  if (status.error) return say(`Oops: ${status.error}`, 5000);
  say(pick(LINES[status.mood] ?? LINES.idle));
}

// ---------- Live reactions (new GitHub activity) ----------

// Most exciting first. `anim` is a CSS class on the pet, `fx` the particle style.
const REACTIONS = [
  { kind: 'merges', anim: 'party', fx: 'confetti', text: 'PR merged! 🎉' },
  { kind: 'prs', anim: 'jump', fx: 'sparkle', text: 'A new PR! Go go go!' },
  { kind: 'reviews', anim: 'wiggle', fx: 'sparkle', text: 'Nice review!' },
  { kind: 'issues', anim: 'wiggle', text: 'Issue noted!' },
  { kind: 'comments', anim: 'wiggle', text: 'Chatty today!' },
  { kind: 'pushes', anim: 'hop', text: 'Nom nom, a push!' },
];
const FX_COLORS = ['var(--gold)', 'var(--pink)', 'var(--sky)', 'var(--green)', 'var(--red)'];
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
  say(count > 1 ? `${reaction.text} x${count}` : reaction.text, 4000);
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

function setHover(active) {
  if (document.body.classList.contains('hover') === active) return;
  document.body.classList.toggle('hover', active);
  api.setClickThrough(!active);
}

// With click-through on, Electron still forwards mouse moves, so hover keeps working.
document.addEventListener('mousemove', (e) => !drag && setHover(isOverPet(e)));
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
  setHover(isOverPet(e));
});

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
  say(`${status?.name ?? 'Your pet'} evolved into ${creature().name}! ✨`, 6000);
});
api.onActivity(reactToActivity);

setSize(await api.size());
setStatus(await api.status());
animatePet(canvas, spriteOptions);
if (status) say(`Hi! I'm ${status.name}`);
