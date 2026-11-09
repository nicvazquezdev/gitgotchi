// Floating pet window: transparent, frameless, always on top and draggable.
const { screen } = require('electron');
const store = require('../store');
const { createWindow } = require('./create-window');
const { IS_MAC } = require('../config');
const petSize = require('./pet-size');
const throwing = require('./pet-throw');

let win = null;

const isOpen = () => Boolean(win && !win.isDestroyed());
const isVisible = () => isOpen() && win.isVisible();

// Size while dragging the panel slider: applied live, saved to the store on release.
let liveSize = null;

/** Current sprite size in px. */
const size = () => petSize.resolveSize(liveSize ?? store.get().petSize);
const windowSize = () => petSize.windowSize(size());

function defaultPosition() {
  const { workArea: a } = screen.getPrimaryDisplay();
  const { width, height } = windowSize();
  return { x: a.x + a.width - width - 24, y: a.y + a.height - height };
}

/** Saved position, if it still falls inside a connected display. */
function initialPosition() {
  const pos = store.get().position;
  if (!pos) return defaultPosition();
  const { width, height } = windowSize();
  const center = { x: pos.x + width / 2, y: pos.y + height / 2 };
  const onScreen = screen
    .getAllDisplays()
    .some(
      ({ workArea: a }) =>
        center.x >= a.x && center.x <= a.x + a.width && center.y >= a.y && center.y <= a.y + a.height,
    );
  return onScreen ? pos : defaultPosition();
}

function create() {
  win = createWindow('pet', {
    ...windowSize(),
    ...initialPosition(),
    // On macOS, 'panel' floats over fullscreen apps without stealing focus.
    type: IS_MAC ? 'panel' : 'toolbar',
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Clicks pass through by default; the renderer turns this off while hovering the pet.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => (win = null));
}

function show() {
  if (isOpen()) win.showInactive();
  else create();
}

function hide() {
  if (isOpen()) win.hide();
}

function close() {
  if (isOpen()) win.close();
}

function send(channel, payload) {
  if (isOpen()) win.webContents.send(channel, payload);
}

function setClickThrough(enabled) {
  if (isOpen() && !followTimer) win.setIgnoreMouseEvents(enabled, { forward: true });
}

// ---------- Drag: the window follows the cursor from the main process ----------

let followTimer = null;
let dragHooks = {};

/** Who else cares about the drag: `start()`, `move(bounds)` after every step and `end()` (the popover follows). */
function setDragHooks(hooks) {
  dragHooks = hooks;
}

function followCursor(onMove) {
  stopFollowing();
  followTimer = setInterval(() => (isOpen() ? onMove(screen.getCursorScreenPoint()) : stopFollowing()), 1000 / 60);
}

function stopFollowing() {
  clearInterval(followTimer);
  followTimer = null;
}

function saveBounds() {
  if (!isOpen()) return;
  const { x, y } = win.getBounds();
  store.update({ position: { x, y } });
}

const TRAIL_MAX = 12; // cursor samples kept: about 200 ms at 60 per second, more than the 90 ms that count
let trail = []; // where the cursor was while dragging: [{ t, x, y }]

// A pet held by the feet hangs below the cursor, where the window has no room: the renderer asks for the window to be
// lowered and draws the pet higher in it by the same amount, so the feet stay at the cursor. Both ease at the same
// pace, up and back down. Keep in sync with LOWER_RISE_S and LOWER_FALL_S in renderer/pet/pet-view.js.
const LOWER_RISE_S = 0.05;
const LOWER_FALL_S = 0.18;
const LOWER_MAX = 400; // px
let lowered = 0; // px the window is lower than where the cursor holds it
let loweredTarget = 0;
let dragging = false;
let anchor = { x: 0, y: 0 }; // where the window is, not counting the lowering

/** `lowered` one step (`seconds`) closer to its target. */
function easeLowered(seconds) {
  const k = 1 - Math.exp(-seconds / (loweredTarget > lowered ? LOWER_RISE_S : LOWER_FALL_S));
  lowered += (loweredTarget - lowered) * k;
  if (Math.abs(loweredTarget - lowered) < 0.25) lowered = loweredTarget;
}

/** The renderer says how far down the window must go to hold the pet by its feet (0: back to normal). */
function dragShift(px) {
  if (dragging) loweredTarget = Math.max(0, Math.min(Number(px) || 0, LOWER_MAX));
}

/** While dragging, the window follows the cursor keeping the grab offset. */
function startDrag({ offsetX, offsetY }) {
  dragHooks.start?.();
  trail = [];
  dragging = true;
  loweredTarget = 0;
  const heldLowered = lowered; // a drag that starts while the window is still coming back up goes on from there
  let last = Date.now();
  followCursor((p) => {
    const now = Date.now();
    easeLowered((now - last) / 1000);
    last = now;
    trail = [...trail.slice(1 - TRAIL_MAX), { t: now, x: p.x, y: p.y }];
    anchor = { x: p.x - offsetX, y: p.y - offsetY - heldLowered };
    win.setPosition(Math.round(anchor.x), Math.round(anchor.y + lowered));
    dragHooks.move?.(win.getBounds());
  });
}

/** Let go: the window comes back up, and if the hand was still moving fast the pet slides on (see pet-throw.js). */
function stopDrag() {
  stopFollowing();
  dragging = false;
  loweredTarget = 0;
  const velocity = isOpen() ? throwing.releaseVelocity(trail, Date.now()) : null;
  trail = [];
  dragHooks.end?.();
  if (velocity || lowered > 0) settle(velocity);
  else saveBounds();
}

/**
 * After the drag: the window comes back up (if it was lowered) and slides on with the speed of the hand, slowing down.
 * It can cross to another screen, and it stops at the edges of all of them. The popover follows. A new drag stops it.
 */
function settle(velocity) {
  const { width, height } = win.getBounds();
  const motion = velocity && new throwing.Slide(velocity);
  const areas = screen.getAllDisplays().map((display) => display.workArea);
  let last = Date.now();
  followTimer = setInterval(() => {
    if (!isOpen()) return stopFollowing();
    const now = Date.now();
    const seconds = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (motion) {
      const next = throwing.limitMove(anchor, motion.step(seconds), { width, height }, areas);
      motion.stop({ x: next.hitX, y: next.hitY });
      anchor = { x: next.x, y: next.y };
    }
    easeLowered(seconds);
    win.setPosition(Math.round(anchor.x), Math.round(anchor.y + lowered));
    dragHooks.move?.(win.getBounds());
    if ((!motion || motion.over) && lowered === 0) {
      stopFollowing();
      saveBounds();
    }
  }, 1000 / 60);
}

/**
 * Resizes the sprite keeping the pet's bottom-center in place, and tells the renderer.
 * `persist: false` skips the disk write (live slider dragging); persist the final value after.
 */
function setSize(next, { persist = true } = {}) {
  liveSize = persist ? null : petSize.resolveSize(next);
  if (persist) store.update({ petSize: petSize.resolveSize(next) });
  if (!isOpen()) return;
  const bounds = win.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const resized = petSize.anchoredBounds(bounds, size(), workArea);
  win.setBounds(resized);
  if (persist) store.update({ position: { x: resized.x, y: resized.y } });
  send('pet:size', size());
}

function ensureOnScreen() {
  if (!isOpen()) return;
  const { x, y } = initialPosition();
  win.setPosition(x, y);
}

module.exports = {
  show,
  hide,
  close,
  isVisible,
  send,
  setClickThrough,
  setDragHooks,
  startDrag,
  stopDrag,
  dragShift,
  ensureOnScreen,
  size,
  setSize,
  get window() {
    return win;
  },
};
