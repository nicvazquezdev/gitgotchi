// Menu bar / tray icon and the shared menu (also shown on right-click over the pet).
const { Menu, Tray, nativeImage } = require('electron');
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

/**
 * @param {object} ctx
 * @param {object|null} ctx.status       pet status (or null)
 * @param {boolean} ctx.configured
 * @param {boolean} ctx.connected
 * @param {boolean} ctx.petVisible
 * @param {object} ctx.actions          { sync, togglePet, openSettings, disconnect, quit }
 */
function buildMenu({ status, configured, connected, petVisible, actions }) {
  const header = status
    ? [
        { label: `${status.name} · ${status.stage.name} · ${status.xp} XP`, enabled: false },
        { label: `This week: ${status.weekScore} pts · ${status.streak}-day streak`, enabled: false },
        { type: 'separator' },
      ]
    : [];

  return Menu.buildFromTemplate([
    ...header,
    {
      label: status?.syncing ? 'Syncing…' : 'Sync now',
      enabled: configured && !status?.syncing,
      click: actions.sync,
    },
    { label: petVisible ? 'Hide pet' : 'Show pet', enabled: configured, click: actions.togglePet },
    { label: 'Repos & pet settings…', click: actions.openSettings },
    { type: 'separator' },
    { label: 'Disconnect & reset', enabled: connected, click: actions.disconnect },
    { label: 'Quit Gitgotchi', click: actions.quit },
  ]);
}

function createTray() {
  const tray = new Tray(pixelIcon(ICON_ART));
  tray.setToolTip('Gitgotchi');
  return tray;
}

module.exports = { createTray, buildMenu };
