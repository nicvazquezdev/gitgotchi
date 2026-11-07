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

// ----- HUD: streak + 7-day chart -----

const weekdayInitial = (day) => new Date(`${day}T00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });
const BAR_MAX_PX = 40;

function renderStreak({ streak, bestStreak, history }) {
  $('#hud-flame').classList.toggle('off', streak === 0);
  $('#hud-streak').replaceChildren(
    streak > 0 ? `${streak}-day streak` : 'No streak',
    bestStreak > streak ? h('small', {}, `Best ${bestStreak}`) : null,
  );
  const max = Math.max(...history.map((d) => d.score), 1);
  $('#hud-chart').replaceChildren(
    ...history.map(({ day, score }, i) =>
      h(
        'div',
        { class: `chart-col${i === history.length - 1 ? ' today' : ''}`, title: `${day}: ${score} pts` },
        h(
          'div',
          { class: 'chart-track' },
          h('div', {
            class: `chart-bar${score ? '' : ' empty'}`,
            // Whole pixels (steps of 2) keep the bars crisp.
            style: score ? { height: `${Math.max(4, Math.round((score / max) * (BAR_MAX_PX / 2)) * 2)}px` } : {},
          }),
        ),
        h('span', { class: 'chart-day' }, weekdayInitial(day)),
      ),
    ),
  );
}

function renderHud() {
  const { name, stage, nextStage, xp, weekScore, hearts, maxHearts, progress, mood, syncing, error } = status;
  $('#hud-name').textContent = name;
  $('#hud-stage').textContent = `${stage.name} · ${weekScore} pts/wk`;
  $('#hud-hearts').replaceChildren(
    ...Array.from({ length: maxHearts }, (_, i) => h('span', { class: i < hearts ? '' : 'empty' }, '♥')),
  );
  $('#xp-fill').style.width = `${Math.round(progress * 100)}%`;
  $('#hud-xp').textContent = nextStage ? `${xp}/${nextStage.minXp} XP` : `${xp} XP · MAX`;
  renderStreak(status);
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

// ---------- Size: Cmd/Ctrl + scroll over the pet ----------

const SIZE_SCROLL_STEP = 40; // accumulated wheel delta that counts as one step
const SIZE_SCROLL_COOLDOWN_MS = 150; // stops trackpad inertia from skipping several sizes
const sizeScroll = { delta: 0, lastStepAt: 0 };

const setSize = (px) => document.documentElement.style.setProperty('--pet-size', `${px}px`);

canvas.addEventListener(
  'wheel',
  (e) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    sizeScroll.delta += e.deltaY;
    if (Math.abs(sizeScroll.delta) < SIZE_SCROLL_STEP) return;
    const direction = -Math.sign(sizeScroll.delta); // scroll up = bigger
    sizeScroll.delta = 0;
    if (e.timeStamp - sizeScroll.lastStepAt < SIZE_SCROLL_COOLDOWN_MS) return;
    sizeScroll.lastStepAt = e.timeStamp;
    api.stepSize(direction);
  },
  { passive: false },
);

// ---------- Main process events ----------

api.onSize(setSize);

api.onStatus(setStatus);
api.onEvolved((stage) => {
  replayClass(canvas, 'evolve');
  say(`${status?.name ?? 'Your pet'} evolved into a ${stage.name}! ✨`, 6000);
});

setSize(await api.size());
setStatus(await api.status());
animatePet(canvas, spriteOptions);
if (status) say(status.stage.index === 0 ? '…' : `Hi! I'm ${status.name}`);
