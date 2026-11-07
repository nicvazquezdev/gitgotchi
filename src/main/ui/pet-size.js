// Pure helpers for the pet size: allowed sizes, window dimensions and anchored resizing.
const { PET_WINDOW, PET_SIZES, DEFAULT_PET_SIZE } = require('../config');

const SIZES = PET_SIZES.map(({ size }) => size);

/** Falls back to the default for any value that isn't an allowed size (e.g. a stale or edited store). */
const resolveSize = (size) => (SIZES.includes(size) ? size : DEFAULT_PET_SIZE);

/** The next allowed size in `direction` (> 0 bigger, < 0 smaller), stopping at both ends. */
function stepSize(size, direction) {
  const i = SIZES.indexOf(resolveSize(size)) + Math.sign(direction);
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, i))];
}

/** The window grows with the sprite; it never gets narrower than the speech bubble and HUD need. */
function windowSize(size) {
  const growth = resolveSize(size) - DEFAULT_PET_SIZE;
  return { width: Math.max(PET_WINDOW.width, PET_WINDOW.width + growth), height: PET_WINDOW.height + growth };
}

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * Bounds of the window after resizing to `size`: the bottom-center point stays in place,
 * then the window is pulled back inside `workArea` if it would stick out.
 * @param {{x:number,y:number,width:number,height:number}} bounds  current window bounds
 * @param {number} size
 * @param {{x:number,y:number,width:number,height:number}} workArea
 */
function anchoredBounds(bounds, size, workArea) {
  const { width, height } = windowSize(size);
  const x = Math.round(bounds.x + bounds.width / 2 - width / 2);
  const y = bounds.y + bounds.height - height;
  return {
    x: clamp(x, workArea.x, Math.max(workArea.x, workArea.x + workArea.width - width)),
    y: clamp(y, workArea.y, Math.max(workArea.y, workArea.y + workArea.height - height)),
    width,
    height,
  };
}

module.exports = { resolveSize, stepSize, windowSize, anchoredBounds };
