// Pure helpers for the pet size: allowed sizes, window dimensions and anchored resizing.
const { PET_WINDOW, PET_SIZE_RANGE, DEFAULT_PET_SIZE } = require('../config');

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/** The nearest allowed size (a multiple of the step inside the range); the default for junk (e.g. a stale store). */
function resolveSize(size) {
  if (!Number.isFinite(size)) return DEFAULT_PET_SIZE;
  const { min, max, step } = PET_SIZE_RANGE;
  return clamp(Math.round(size / step) * step, min, max);
}

/** The window grows with the sprite; it never gets narrower than the speech bubble and HUD need. */
function windowSize(size) {
  const growth = resolveSize(size) - DEFAULT_PET_SIZE;
  return { width: Math.max(PET_WINDOW.width, PET_WINDOW.width + growth), height: PET_WINDOW.height + growth };
}

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

module.exports = { resolveSize, windowSize, anchoredBounds };
