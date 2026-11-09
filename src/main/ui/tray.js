// Menu bar / tray icon: a generic pixel pet glyph and nothing else (no number, no badge: the app stays quiet there).
// Clicking it (or right-clicking it) opens the menu (see main.js); the card hangs from the pet.
const { Tray, nativeImage } = require('electron');
const { IS_MAC } = require('../config');
const { glyphBitmap } = require('./tray-glyph');

// Windows and Linux trays have no template images and can be light or dark: the pink of the accent reads on both.
const TRAY_COLOR = [0xff, 0x3e, 0xa5];

/** @1x and @2x bitmaps in one image; on macOS a "template image" (adapts to light/dark menu bars). */
function glyphIcon() {
  const img = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2])
    img.addRepresentation(glyphBitmap(scaleFactor, undefined, IS_MAC ? undefined : TRAY_COLOR));
  if (IS_MAC) img.setTemplateImage(true);
  return img;
}

function createTray() {
  const tray = new Tray(glyphIcon());
  tray.setToolTip('Gitgotchi');
  return tray;
}

module.exports = { createTray };
