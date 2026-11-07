// Menu bar / tray icon. Clicking it opens the panel (see panel-window.js).
const { Tray, nativeImage } = require('electron');
const { IS_MAC } = require('../config');

// 16x16 pixel blob. On macOS it's a "template image" (adapts to light/dark mode).
const ICON_ART = [
  '................',
  '.....######.....',
  '...##########...',
  '..############..',
  '.##############.',
  '.###..####..###.',
  '.###..####..###.',
  '################',
  '################',
  '####.######.####',
  '#####......#####',
  '################',
  '################',
  '################',
  '##.###.##.###.##',
  '#...#...#...#..#',
];

function pixelIcon(art, scale = 2) {
  const size = art.length * scale;
  const buffer = Buffer.alloc(size * size * 4); // transparent black
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (art[Math.floor(y / scale)][Math.floor(x / scale)] === '#') buffer[(y * size + x) * 4 + 3] = 255;
  const img = nativeImage.createFromBitmap(buffer, { width: size, height: size, scaleFactor: scale });
  if (IS_MAC) img.setTemplateImage(true);
  return img;
}

function createTray() {
  const tray = new Tray(pixelIcon(ICON_ART));
  tray.setToolTip('Gitgotchi');
  return tray;
}

module.exports = { createTray };
