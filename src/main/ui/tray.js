// Menu bar / tray icon: the pixel pet glyph plus the number of PRs waiting for review.
// Clicking it opens the dropdown (see panel-window.js).
const { Tray, nativeImage } = require('electron');
const { IS_MAC } = require('../config');
const { glyphBitmap, trayTitle } = require('./tray-glyph');

/** @1x and @2x bitmaps in one image; on macOS a "template image" (adapts to light/dark menu bars). */
function glyphIcon() {
  const img = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) img.addRepresentation(glyphBitmap(scaleFactor));
  if (IS_MAC) img.setTemplateImage(true);
  return img;
}

function createTray() {
  const tray = new Tray(glyphIcon());
  tray.setToolTip('Gitgotchi');
  return tray;
}

/** Shows the waiting-PR count next to the icon (macOS only; empty when nothing waits). */
function updateTray(tray, status) {
  if (!IS_MAC) return;
  const waiting = status?.prs?.waiting?.length ?? 0;
  tray.setTitle(trayTitle(waiting), { fontType: 'monospacedDigit' });
}

module.exports = { createTray, updateTray };
