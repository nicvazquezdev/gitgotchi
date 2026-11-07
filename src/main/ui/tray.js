// Menu bar / tray icon: a generic pixel pet glyph, and next to it (optional) how many PRs wait for the user's review.
// Clicking it opens the dropdown (see panel-window.js).
const { Tray, nativeImage } = require('electron');
const { IS_MAC } = require('../config');
const { glyphBitmap } = require('./tray-glyph');

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

/** Shows `{ title, tooltip }` (see tray-label.js): the count goes next to the icon on macOS (other systems have no title). */
function setTrayLabel(tray, { title, tooltip }) {
  if (IS_MAC) tray.setTitle(title, { fontType: 'monospacedDigit' });
  tray.setToolTip(tooltip);
}

module.exports = { createTray, setTrayLabel };
