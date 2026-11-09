// Shared factory for the small frameless windows that hang from an anchor (menu bar dropdown, PR popover):
// transparent (the page draws the rounded card), hidden on blur/Escape, and sized to the page's content.
const { screen } = require('electron');
const { createWindow } = require('./create-window');
const { IS_MAC } = require('../config');

// Clicking the anchor blurs (hides) the window first; ignore the click that follows right after.
const REOPEN_GUARD_MS = 250;
// Pressing the pet blurs the popover before the page says that a drag begins: hide a moment later, unless held.
const BLUR_GRACE_MS = 60;
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
  let held = false; // the anchor is being dragged: losing the focus does not close the window
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
    win.on('blur', () => setTimeout(() => !held && hide(), BLUR_GRACE_MS));
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
   * The anchor moved (the pet is dragged): the window goes with it. The page only hears about it when the shape
   * changes (the popover flips to the other side, the tail moves), not on every step.
   */
  function follow(rect) {
    if (!isVisible()) return;
    const shapeOf = ({ x, y, width, height, ...rest }) => JSON.stringify(rest);
    const before = placed && shapeOf(placed);
    anchor = rect;
    place();
    if (shapeOf(placed) !== before) send();
  }

  /**
   * While `on`, the window stays open without the focus (the anchor is being dragged). When it ends the window gets
   * the focus back, so that a click elsewhere closes it again.
   */
  function hold(on) {
    held = on;
    if (!on && isVisible()) win.focus();
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
    /** @param {(visible: boolean) => void} listener  called when the window shows or hides */
    onVisibility: (listener) => (onVisibility = listener),
    show,
    follow,
    hold,
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
