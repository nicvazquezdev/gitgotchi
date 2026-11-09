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
  // The page went away while the pet was held (a reload, a crash): nobody will say that the drag is over.
  win.webContents.on('did-start-loading', () => dragging && stopDrag({ throwable: false }));
  win.webContents.on('render-process-gone', () => dragging && stopDrag({ throwable: false }));
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
// lowered and draws the pet higher in it by the same amount, so the feet stay at the cursor (see Lowering).
const LOWER_MAX = 400; // px
const lowering = new throwing.Lowering();
let dragging = false;
// The page says every so often that it still holds the pet (`dragAlive`). If it goes quiet (it reloaded, it hung, it
// lost the pointer) nobody will say that the drag is over, and the window would follow the cursor for ever.
const ALIVE_MS = 1500;
let lastAlive = 0;
let anchor = { x: 0, y: 0 }; // where the window is, not counting the lowering

/** The renderer says how far down the window must go to hold the pet by its feet (0: back to normal). */
function dragShift(px) {
  if (dragging) lowering.target = Math.max(0, Math.min(Number(px) || 0, LOWER_MAX));
}

/** The page still holds the pet. */
function dragAlive() {
  lastAlive = Date.now();
}

/** While dragging, the window follows the cursor keeping the grab offset. */
function startDrag({ offsetX, offsetY }) {
  dragHooks.start?.();
  trail = [];
  dragging = true;
  lastAlive = Date.now();
  lowering.target = 0;
  const heldLowered = lowering.value; // a drag that starts while the window is still coming back up goes on from there
  let last = Date.now();
  followCursor((p) => {
    const now = Date.now();
    if (now - lastAlive > ALIVE_MS) return stopDrag({ throwable: false }); // the page is gone: let go of the pet
    lowering.step((now - last) / 1000);
    last = now;
    trail = [...trail.slice(1 - TRAIL_MAX), { t: now, x: p.x, y: p.y }];
    anchor = { x: p.x - offsetX, y: p.y - offsetY - heldLowered };
    win.setPosition(Math.round(anchor.x), Math.round(anchor.y + lowering.value));
    dragHooks.move?.(win.getBounds());
  });
}

/**
 * Let go: the window comes back up, and if the hand was still moving fast the pet slides on (see pet-throw.js).
 * `throwable` false (the reactions are off, or Reduce Motion): it stays where it was let go.
 */
function stopDrag({ throwable = true } = {}) {
  stopFollowing();
  dragging = false;
  lowering.target = 0;
  const velocity = isOpen() && throwable ? throwing.releaseVelocity(trail, Date.now()) : null;
  trail = [];
  dragHooks.end?.();
  if (velocity || lowering.value > 0) settle(velocity);
  else saveBounds();
}

/**
 * After the drag: the window comes back up (if it was lowered) and slides on with the speed of the hand, slowing down.
 * It can cross to another screen, it bounces off the walls and the top of the screen (the renderer squashes the pet
 * for each hard hit) and it lands on the bottom. The popover follows. A new drag stops it.
 */
function settle(velocity) {
  const { width, height } = win.getBounds();
  const motion = velocity && new throwing.Slide(velocity);
  const areas = screen.getAllDisplays().map((display) => display.workArea);
  const hit = (axis, keep) => {
    const speed = motion.bounce(axis, keep);
    if (speed >= throwing.THROW.bumpMin) send('pet:bump', { axis, speed });
  };
  let last = Date.now();
  followTimer = setInterval(() => {
    if (!isOpen()) return stopFollowing();
    const now = Date.now();
    const seconds = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (motion) {
      const move = motion.step(seconds);
      const next = throwing.limitMove(anchor, move, { width, height }, areas);
      if (next.hitX) hit('x', throwing.THROW.bounce);
      if (next.hitY) hit('y', move.dy > 0 ? 0 : throwing.THROW.bounce); // the bottom is the floor: no bounce
      anchor = { x: next.x, y: next.y };
    }
    lowering.step(seconds);
    win.setPosition(Math.round(anchor.x), Math.round(anchor.y + lowering.value));
    dragHooks.move?.(win.getBounds());
    if ((!motion || motion.over) && lowering.value === 0) {
      stopFollowing();
      saveBounds();
      tellPointer();
    }
  }, 1000 / 60);
}

/**
 * The window moved from under a still cursor: the page gets the cursor in its own coordinates, to see again whether
 * it is on the pet (it hears no mouse move for that).
 */
function tellPointer() {
  if (!isOpen()) return;
  const { x, y } = screen.getCursorScreenPoint();
  const bounds = win.getBounds();
  send('pet:pointer', { x: x - bounds.x, y: y - bounds.y });
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
  dragAlive,
  ensureOnScreen,
  size,
  setSize,
  get window() {
    return win;
  },
};
