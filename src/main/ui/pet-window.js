// Floating pet window: transparent, frameless, always on top and draggable.
const { screen } = require('electron');
const store = require('../store');
const { createWindow } = require('./create-window');
const { IS_MAC } = require('../config');
const petSize = require('./pet-size');

let win = null;
let dragTimer = null;

const isOpen = () => Boolean(win && !win.isDestroyed());
const isVisible = () => isOpen() && win.isVisible();

/** Current sprite size in px. */
const size = () => petSize.resolveSize(store.get().petSize);
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
  if (isOpen() && !dragTimer) win.setIgnoreMouseEvents(enabled, { forward: true });
}

/** While dragging, the window follows the cursor keeping the grab offset. */
function startDrag({ offsetX, offsetY }) {
  stopDrag();
  dragTimer = setInterval(() => {
    if (!isOpen()) return stopDrag();
    const p = screen.getCursorScreenPoint();
    win.setPosition(Math.round(p.x - offsetX), Math.round(p.y - offsetY));
  }, 1000 / 60);
}

function stopDrag() {
  clearInterval(dragTimer);
  dragTimer = null;
  if (!isOpen()) return;
  const [x, y] = win.getPosition();
  store.update({ position: { x, y } });
}

/** Resizes the sprite keeping the pet's bottom-center in place, and tells the renderer. */
function setSize(next) {
  store.update({ petSize: petSize.resolveSize(next) });
  if (!isOpen()) return;
  const bounds = win.getBounds();
  const { workArea } = screen.getDisplayMatching(bounds);
  const resized = petSize.anchoredBounds(bounds, size(), workArea);
  win.setBounds(resized);
  store.update({ position: { x: resized.x, y: resized.y } });
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
  startDrag,
  stopDrag,
  ensureOnScreen,
  size,
  setSize,
  get window() {
    return win;
  },
};
