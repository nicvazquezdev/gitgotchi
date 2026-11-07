// Menu bar / tray icon: the user's current pet (current stage) as a one-color shape with its eyes cut out, no text. Until the status is known
// it shows the generic pixel glyph. Clicking it opens the dropdown (see panel-window.js).
const path = require('node:path');
const { Tray, nativeImage } = require('electron');
const { IS_MAC } = require('../config');
const { glyphBitmap, scaleNearest, detailMask } = require('./tray-glyph');

const PETS_DIR = path.join(__dirname, '../../../assets/pets');
const ICON_POINTS = 18; // menu bar icon height in points; drawn at 2x so it stays crisp on retina

/** @1x and @2x bitmaps in one image; on macOS a "template image" (adapts to light/dark menu bars). */
function glyphIcon() {
  const img = nativeImage.createEmpty();
  for (const scaleFactor of [1, 2]) img.addRepresentation(glyphBitmap(scaleFactor));
  if (IS_MAC) img.setTemplateImage(true);
  return img;
}

/** The pet shape (silhouette minus dark details) as a macOS template image (drawn in the menu bar's own color), scaled with nearest-neighbor to ICON_POINTS. */
function petIcon(file) {
  const sprite = nativeImage.createFromPath(path.join(PETS_DIR, file));
  const { width: side } = sprite.getSize();
  if (!side) return null;
  const px = ICON_POINTS * 2;
  const icon = nativeImage.createFromBitmap(scaleNearest(detailMask(sprite.toBitmap(), side), side, px), {
    width: px,
    height: px,
    scaleFactor: 2,
  });
  if (IS_MAC) icon.setTemplateImage(true);
  return icon;
}

function createTray() {
  const tray = new Tray(glyphIcon());
  tray.setToolTip('Gitgotchi');
  return tray;
}

let shownFile = null;

/** Shows the pet's current stage in the menu bar. */
function updateTray(tray, status) {
  const stage = status?.species?.stages?.[status.stage?.index];
  if (!stage?.file || stage.file === shownFile) return;
  const icon = petIcon(stage.file);
  if (!icon) return;
  shownFile = stage.file;
  tray.setImage(icon);
}

module.exports = { createTray, updateTray };
