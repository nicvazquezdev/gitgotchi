// Shared factory for the small frameless windows that hang from an anchor (menu bar dropdown, PR popover):
// transparent (the page draws the rounded card), hidden on blur/Escape, and sized to the page's content.
const { screen } = require('electron');
const { createWindow } = require('./create-window');
const { IS_MAC } = require('../config');

// Clicking the anchor blurs (hides) the window first; ignore the click that follows right after.
const REOPEN_GUARD_MS = 250;
// Pressing the pet blurs the popover before the page says that a drag begins: hide a moment later, unless held.
const BLUR_GRACE_MS = 60;
// A window opened from this one (share, settings) takes the focus a moment later: that blur does not close it.
const KEEP_OPEN_MS = 2500;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 900; // the popover with its shell is taller than a plain card

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
  let sentRoom; // the `room` the page has (it is held back while the anchor is dragged, see `follow`)
  let held = false; // the anchor is being dragged: losing the focus does not close the window
  let keepUntil = 0; // until then, losing the focus does not close the window (see `keepOpen`)
  let getState = () => null;
  let onVisibility = () => {};

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
    win.setAlwaysOnTop(true, level, 1); // relative level 1: above the pet window, which sits on the same level
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.on('blur', () => {
      if (Date.now() < keepUntil) return;
      setTimeout(() => !held && hide(), BLUR_GRACE_MS);
    });
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape') {
        event.preventDefault();
        hide();
      }
    });
    win.on('show', () => onVisibility(true));
    win.on('hide', () => onVisibility(false));
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
    held = false;
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

  /**
   * The anchor moved (the pet is dragged): the window goes with it. `room` (the space above or below) changes with
   * almost every step and, at the screen edges, so does `tailX`: drawing the page again for each makes it flicker. So
   * only a flip to the other side sends the state; the tail slides on its own channel, and `room` waits for `hold(false)`.
   */
  function follow(rect) {
    if (!isVisible()) return;
    const shapeOf = ({ x, y, width, height, tailX, room, ...rest }) => JSON.stringify(rest);
    const before = placed && shapeOf(placed);
    const tailBefore = placed?.tailX;
    anchor = rect;
    place();
    if (shapeOf(placed) !== before) send();
    else if (placed.tailX !== tailBefore) win.webContents.send(`${channel}:tail`, placed.tailX);
  }

  /**
   * While `on`, the window stays open without the focus (the anchor is being dragged). When it ends the window gets
   * the focus back, so that a click elsewhere closes it again, and the page learns the `room` it has now.
   */
  function hold(on) {
    held = on;
    if (on || !isVisible()) return;
    win.focus();
    if (placed?.room !== sentRoom) send();
  }

  /** Pushes the current state to the page (no-op while closed). */
  function send() {
    if (!isOpen()) return;
    sentRoom = placed?.room;
    win.webContents.send(channel, getState());
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
    /** @param {(visible: boolean) => void} listener  called when the window shows or hides */
    onVisibility: (listener) => (onVisibility = listener),
    show,
    follow,
    hold,
    /** Another window of the app is about to open from this one: the focus it takes does not close this window. */
    keepOpen: () => (keepUntil = Date.now() + KEEP_OPEN_MS),
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
