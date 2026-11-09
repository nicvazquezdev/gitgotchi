// Menu bar / tray icon: a generic pixel pet glyph and nothing else (no number, no badge: the app stays quiet there).
// Clicking it opens the card, right-clicking it the menu (see main.js).
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

module.exports = { createTray };
