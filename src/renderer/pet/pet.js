import { $, h, replayClass } from '../shared/dom.js';
import { plural, oldestDays, oldestWaitingDays } from '../shared/format.js';
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
// Reduce Motion (macOS accessibility) and Do not disturb: the pet only idles (no walks, cheers or particles).
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const calm = () => reducedMotion.matches || prefs.doNotDisturb;
const syncCalm = () => view.setCalm(calm());
reducedMotion.addEventListener('change', syncCalm);

const LINES = {
  happy: ['What a week! 🔥', 'Yum, fresh pushes!', 'I feel huge today', 'Keep it up!'],
  neutral: ['All quiet here', 'One more PR?', "I'm a little hungry…", 'A push would be nice'],
  anxious: ['Someone needs a review…', 'That PR has been waiting a while', 'A review would calm me down'],
};

let status = null;
let prefs = { speechBubbles: true, doNotDisturb: false };
let drag = null;
let spoken = null; // the line being said right now: { title, sub, dot }
let bubbleTimer = null;
let waitingVisible = false; // the PR reminder is only up for a moment, so the pet never nags
let waitingTimer = null;
let waitingCount = null;
let reviewCount = null;
let loading = Promise.resolve(); // the creature on screen is being swapped for another one

const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** The creature for the current stage, e.g. { name: 'Chispín', size: 36, ... }. */
const creature = () => status.species.stages[status.stage.index];

// ---------- Render ----------

function setStatus(next) {
  if (!next) return;
  const moodChanged = status && status.mood !== next.mood;
  const creatureChanged = !status || status.species.id !== next.species.id || status.stage.index !== next.stage.index;
  status = next;
  // The pet on the desktop is always in its normal state: the mood (and why) is shown in the popover.
  if (creatureChanged) {
    loading = view.setCreature(status.species.id, status.stage.index).catch((err) => console.error(err));
  }
  const count = status.prs?.waiting?.length ?? 0;
  const reviews = status.reviewQueue?.length ?? 0;
  if (count !== waitingCount || reviews !== reviewCount) {
    const changed = (count !== waitingCount && count > 0) || (reviews !== reviewCount && reviews > 0);
    waitingCount = count;
    reviewCount = reviews;
    if (changed) showWaiting(); // first status or a number went up or changed
  }
  // Native sprite size of the current stage: CSS places the bubble and indicators around it.
  root.setProperty('--stage-size', creature().size);
  $('#alert').hidden = !status.error;
  if (moodChanged) say(pick(LINES[status.mood] ?? LINES.neutral));
  else renderBubble();
}

function setSize(px) {
  root.setProperty('--pet-size', `${px}px`);
  view.setScale(Math.round(px / PX_PER_SCALE));
}

// ---------- Bubble ----------
// A card with a dot, a bold line and a secondary line. It only speaks for a moment: mood changes, live reactions,
// and the PR reminder (when the number of PRs that wait for the user's review, or of their own, changes; click to see them).
// Off with Speech bubbles or Do not disturb.

const quiet = () => !prefs.speechBubbles || prefs.doNotDisturb;

/** The standing message: PRs waiting for the user's review first (they can act on those), else their own PRs. */
function waitingMessage() {
  if (status?.timeOff?.active) return null; // on time off nothing is waiting for the person
  const queue = status?.reviewQueue ?? [];
  if (queue.length) {
    const days = oldestWaitingDays(queue); // since the user was asked; null when no request has a known date
    const wait = days === null ? '' : days > 0 ? `The oldest has waited ${plural(days, 'day')}. ` : 'Asked today. ';
    return {
      title: queue.length === 1 ? '1 PR needs your review' : `${queue.length} PRs need your review`,
      sub: `${wait}Click me to see them.`,
      dot: 'waiting',
    };
  }
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
  const { toast } = message;
  const key = `${message.title}|${message.sub}|${toast?.icon}`;
  if (bubble.dataset.key === key) return; // unchanged: don't replay the pop-in
  bubble.dataset.key = key;
  bubble.className = toast ? `bubble toast tier-${toast.tier}` : 'bubble';
  bubble.replaceChildren(
    // A toast, like a console's: the medal, what it is (and a figure on the right), the name and what it was for.
    ...(toast ? [h('div', { class: 'bubble-medal' }, medal(toast.icon, 2))] : []),
    h(
      'div',
      { class: 'bubble-text' },
      ...(toast
        ? [
            h(
              'div',
              { class: 'bubble-kicker' },
              h('span', {}, toast.kicker),
              ...(toast.side ? [h('b', {}, toast.side)] : []),
            ),
          ]
        : []),
      h(
        'div',
        { class: 'bubble-title' },
        ...(toast ? [] : [h('span', { class: `dot ${message.dot ?? ''}` })]),
        message.title,
      ),
      // Not `null`: replaceChildren turns it into the text "null".
      ...(message.sub ? [h('div', { class: 'bubble-sub' }, message.sub)] : []),
    ),
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
function say(title, { sub, dot, toast, ms = 3500 } = {}) {
  spoken = { title, sub, dot, toast };
  renderBubble();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    spoken = null;
    renderBubble();
  }, ms);
}

/** Opens the PR popover above the creature (a second click closes it). */
function openPopover() {
  const bounds = view.bounds();
  if (bounds) api.openPopover(bounds);
}

function reactToClick() {
  if (!status) return;
  if (!calm()) replayClass(canvas, 'jump');
  openPopover();
}

// ---------- Live reactions (new GitHub activity) ----------

// Most exciting first. `cheer`: the pet's cheer animation; otherwise `anim` is a CSS class on the pet, `fx` the particle style.
const REACTIONS = [
  { kind: 'merges', cheer: true, text: 'PR merged! 🎉', dot: 'approved' },
  { kind: 'approvals', cheer: true, text: 'Your PR got approved! 🎉', dot: 'approved' },
  { kind: 'achievements', cheer: true, text: 'Achievement unlocked! 🏆', dot: 'approved' },
  { kind: 'goal', cheer: true, text: 'Daily goal reached!', dot: 'approved' },
  { kind: 'readyToMerge', anim: 'jump', fx: 'sparkle', text: 'Your PR is ready to merge!', dot: 'approved' },
  { kind: 'changesRequested', anim: 'wiggle', text: 'Changes requested on your PR', dot: 'waiting' },
  { kind: 'checksFailed', anim: 'wiggle', text: 'Checks failed on your PR', dot: 'waiting' },
  { kind: 'mergeConflicts', anim: 'wiggle', text: 'Merge conflicts on your PR', dot: 'waiting' },
  { kind: 'prs', anim: 'jump', fx: 'sparkle', text: 'A new PR! Go go go!', dot: 'waiting' },
  { kind: 'reviewRequests', anim: 'jump', fx: 'sparkle', text: 'Someone wants your review!', dot: 'waiting' },
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
  say(count > 1 ? `${reaction.text} x${count}` : reaction.text, { dot: reaction.dot, ms: 4000 });
}

/**
 * New achievements: the usual cheer, then a toast with the medal of the first one, its points and what it was for
 * (the rest are in the profile).
 */
function celebrateAchievements(list) {
  if (!list?.length) return;
  reactToActivity({ achievements: list.length });
  const [first] = list;
  const several = list.length > 1;
  say(first.name, {
    sub: several ? `And ${list.length - 1} more in your profile` : first.description,
    toast: {
      icon: first.icon,
      tier: first.tier ?? 'bronze',
      side: `+${list.reduce((sum, a) => sum + (a.points ?? 0), 0)} pts`,
      kicker: several ? `${list.length} achievements unlocked` : 'Achievement unlocked',
    },
    ms: 6000,
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
  drag = { x: e.screenX, y: e.screenY, moved: false };
  syncStill();
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
  say(`${status?.name ?? 'Your pet'} evolved into ${creature().name}! ✨`, { ms: 6000 });
});
api.onActivity(reactToActivity);
api.onAchievements(celebrateAchievements);
// The daily goal: the cheer and a toast.
api.onGoal(({ xp, goal }) => {
  reactToActivity({ goal: 1 });
  say('Goal reached', {
    sub: `${xp} XP today · a typical day is ${goal}`,
    toast: { icon: 'target', tier: 'gold', kicker: 'Daily goal' },
    ms: 5000,
  });
});
// A new level: a hop, sparkles and a toast (if it also evolves, the evolution that follows takes over).
api.onLevelUp(({ level, toNext, name }) => {
  if (!calm()) {
    replayClass(canvas, 'jump');
    burst('sparkle');
  }
  say(`Level ${level}`, {
    sub: `${name} · ${toNext} XP to level ${level + 1}`,
    toast: { icon: 'up', tier: 'special', kicker: 'Level up' },
    ms: 4500,
  });
});
// The user hatched a pet or switched to another one: it comes in out of a flash and says that it earns the XP now.
api.onCompanion(({ kind, name }) => {
  loading.then(() => !calm() && replayClass(canvas, 'swap'));
  say(kind === 'hatched' ? 'Hello, world! 🥚' : 'My turn! ✨', {
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

setSize(await api.size());
prefs = await api.prefs();
syncCalm();
setStatus(await api.status());
if (status && !waitingMessage()) say(`Hi! I'm ${status.name}`);
