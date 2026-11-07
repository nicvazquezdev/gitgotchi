import { $, h, replayClass } from '../shared/dom.js';
import { animatePet } from '../shared/sprite.js';

const { pet: api } = window.gitgotchi;
const canvas = $('#pet');
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

// ---------- Render ----------

function renderHud() {
  const { name, stage, nextStage, xp, weekScore, hearts, maxHearts, progress, mood, syncing, error } = status;
  $('#hud-name').textContent = name;
  $('#hud-stage').textContent = `${stage.name} · ${weekScore} pts/wk`;
  $('#hud-hearts').replaceChildren(
    ...Array.from({ length: maxHearts }, (_, i) => h('span', { class: i < hearts ? '' : 'empty' }, '♥')),
  );
  $('#xp-fill').style.width = `${Math.round(progress * 100)}%`;
  $('#hud-xp').textContent = nextStage ? `${xp}/${nextStage.minXp} XP` : `${xp} XP · MAX`;
  $('#hud-sync').hidden = !syncing;
  $('#zzz').hidden = mood !== 'sleeping';
  $('#alert').hidden = !error;
}

function setStatus(next) {
  if (!next) return;
  status = next;
  renderHud();
}

function spriteOptions() {
  return (
    status && { species: status.species, stageIndex: status.stage.index, mood: status.mood, progress: status.progress }
  );
}

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
  if (status.stage.index === 0) return say(`${status.nextStage.minXp - status.xp} XP until I hatch…`);
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
    const dist = 44 + (i % 3) * 16;
    const particle = h('i', { class: `particle ${style}`, style: { background: FX_COLORS[i % FX_COLORS.length] } });
    // Custom properties need setProperty (Object.assign on style ignores them).
    particle.style.setProperty('--x', `${Math.round(Math.cos(angle) * dist)}px`);
    particle.style.setProperty('--y', `${Math.round(Math.sin(angle) * dist)}px`);
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

function setHover(active) {
  document.body.classList.toggle('hover', active);
  api.setClickThrough(!active);
}

canvas.addEventListener('mouseenter', () => setHover(true));
canvas.addEventListener('mouseleave', () => !drag && setHover(false));

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  drag = { x: e.screenX, y: e.screenY, moved: false };
  canvas.setPointerCapture(e.pointerId);
  api.dragStart({ offsetX: e.clientX, offsetY: e.clientY });
});

canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.moved) return;
  if (Math.hypot(e.screenX - drag.x, e.screenY - drag.y) > DRAG_THRESHOLD_PX) {
    drag.moved = true;
    canvas.classList.add('dragging');
    document.body.classList.add('dragging');
  }
});

canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  api.dragEnd();
  const wasClick = !drag.moved;
  drag = null;
  canvas.classList.remove('dragging');
  document.body.classList.remove('dragging');
  if (wasClick) reactToClick();
  // If the cursor ended up outside the pet, clicks pass through the window again.
  const r = canvas.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!inside) setHover(false);
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  api.openMenu();
});

// ---------- Main process events ----------

api.onStatus(setStatus);
api.onEvolved((stage) => {
  replayClass(canvas, 'evolve');
  say(`${status?.name ?? 'Your pet'} evolved into a ${stage.name}! ✨`, 6000);
});

api.onActivity(reactToActivity);

setStatus(await api.status());
animatePet(canvas, spriteOptions);
if (status) say(status.stage.index === 0 ? '…' : `Hi! I'm ${status.name}`);
