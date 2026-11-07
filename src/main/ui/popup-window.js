// Shared factory for the small frameless windows that hang from an anchor (menu bar dropdown, PR popover):
// transparent (the page draws the rounded card), hidden on blur/Escape, and sized to the page's content.
const { screen } = require('electron');
const { createWindow } = require('./create-window');
const { IS_MAC } = require('../config');

// Clicking the anchor blurs (hides) the window first; ignore the click that follows right after.
const REOPEN_GUARD_MS = 250;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 800;

/**
 * @param {{ page: string, channel: string, size: {width:number,height:number}, level: string,
 *           boundsFor: (args: {anchor, size, workArea}) => {x:number,y:number,width:number,height:number} }} options
 *   `channel`: where the state goes; `boundsFor` returns the placed bounds (extra fields are kept in `placement()`).
 */
function createPopup({ page, channel, size, level, boundsFor }) {
  let win = null;
  let anchor = null;
  let height = size.height;
  let hiddenAt = 0;
  let placed = null;
  let getState = () => null;

  const isOpen = () => Boolean(win && !win.isDestroyed());
  const isVisible = () => isOpen() && win.isVisible();

  function create() {
    win = createWindow(page, {
      width: size.width,
      height,
      type: IS_MAC ? 'panel' : 'toolbar',
      transparent: true,
      backgroundColor: '#00000000',
      frame: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
    });
    win.setAlwaysOnTop(true, level);
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
    placed = boundsFor({ anchor, size: { width: size.width, height }, workArea });
    const { x, y, width, height: h } = placed;
    win.setBounds({ x, y, width, height: h });
  }

  /** Opens (or moves) the window at `rect`: `{x, y, width, height}`, zero-size for a point. */
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
    if (isOpen()) win.webContents.send(channel, getState());
  }

  /** The page reports its content height; the window follows and stays anchored. */
  function setHeight(next) {
    height = Math.max(MIN_HEIGHT, Math.min(Math.round(next), MAX_HEIGHT));
    if (!isOpen() || !anchor) return;
    place();
    send(); // the placement (e.g. the popover's tail side) may have changed
  }

  return {
    /** @param {() => object} stateProvider  what the page shows (sent on every open and update) */
    init: (stateProvider) => (getState = stateProvider),
    show,
    hide,
    toggle,
    send,
    state: () => getState(),
    setHeight,
    isVisible,
    /** Result of the last placement (`boundsFor`), e.g. the popover's tail side. */
    placement: () => placed,
  };
}

module.exports = { createPopup };
