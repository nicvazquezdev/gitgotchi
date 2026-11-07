// Menu-bar panel: small frameless window opened from the tray icon or a right-click on the pet.
const { screen } = require('electron');
const { createWindow } = require('./create-window');
const { panelBounds } = require('./panel-position');
const { IS_MAC, PANEL_WINDOW } = require('../config');

// Clicking the tray icon blurs (hides) the panel first; ignore the click that follows right after.
const REOPEN_GUARD_MS = 250;

let win = null;
let anchor = null; // rect the panel hangs from
let height = PANEL_WINDOW.height;
let hiddenAt = 0;
let getState = () => null;

const isOpen = () => Boolean(win && !win.isDestroyed());
const isVisible = () => isOpen() && win.isVisible();

/** @param {() => object} stateProvider  what the page shows (sent on every open and update) */
function init(stateProvider) {
  getState = stateProvider;
}

function create() {
  win = createWindow('panel', {
    width: PANEL_WINDOW.width,
    height,
    type: IS_MAC ? 'panel' : 'toolbar',
    backgroundColor: '#14102a',
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
  });
  win.setAlwaysOnTop(true, 'pop-up-menu');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.on('blur', hide);
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      hide();
    }
  });
  win.on('closed', () => (win = null));
}

function place() {
  const { workArea } = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y });
  win.setBounds(panelBounds({ anchor, size: { width: PANEL_WINDOW.width, height }, workArea }));
}

/** Opens (or moves) the panel under `rect`: `{x, y, width, height}`, zero-size for a point. */
function show(rect) {
  anchor = rect;
  if (!isOpen()) create();
  place();
  send();
  const reveal = () => {
    win.show();
    win.focus();
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', reveal);
  else reveal();
}

function hide() {
  if (!isVisible()) return;
  hiddenAt = Date.now();
  win.hide();
}

function toggle(rect) {
  if (isVisible()) hide();
  else if (Date.now() - hiddenAt > REOPEN_GUARD_MS) show(rect);
}

/** Pushes the current state to the page (no-op while closed). */
function send() {
  if (isOpen()) win.webContents.send('panel:state', getState());
}

/** The page reports its content height; the window follows and stays anchored. */
function setHeight(next) {
  height = Math.max(120, Math.min(Math.round(next), 800));
  if (isOpen() && anchor) place();
}

module.exports = { init, show, hide, toggle, send, setHeight, isVisible };
