// Copies a part of a window to the clipboard as an image (the share card of the profile). It only reads the pixels of
// the window that asks, and only writes to the local clipboard: nothing is sent anywhere.
const { clipboard } = require('electron');
const { validRect } = require('../capture-rect');

/**
 * @param {Electron.WebContents} webContents  the window that asked
 * @param {{ x: number, y: number, width: number, height: number }} rect  in the page's own coordinates (CSS pixels)
 * @returns {Promise<{ ok: true } | { error: string, message: string }>}
 */
async function copyRegion(webContents, rect) {
  const area = validRect(rect);
  if (!area) return { error: 'INVALID', message: 'There is nothing to copy there' };
  const image = await webContents.capturePage(area);
  if (image.isEmpty()) return { error: 'EMPTY', message: 'The window has nothing to copy yet' };
  clipboard.writeImage(image);
  return { ok: true };
}

module.exports = { copyRegion };
