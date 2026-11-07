// Pure helpers for the pet size: allowed sizes, window dimensions and anchored resizing.
const { PET_WINDOW, PET_SIZE_RANGE, DEFAULT_PET_SIZE } = require('../config');

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/** Whole pixels inside the allowed range; the default for junk (e.g. a stale or edited store). */
function resolveSize(size) {
  if (!Number.isFinite(size)) return DEFAULT_PET_SIZE;
  return clamp(Math.round(size), PET_SIZE_RANGE.min, PET_SIZE_RANGE.max);
}

/** One step bigger (direction > 0) or smaller (< 0), stopping at both ends. */
const stepSize = (size, direction) => resolveSize(resolveSize(size) + Math.sign(direction) * PET_SIZE_RANGE.step);

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

// ---------- Corner resize ----------
// `corner` is the grabbed corner of the sprite ('nw' | 'ne' | 'sw' | 'se'); `anchor` is the opposite one,
// which stays fixed on screen. The sprite sits at the bottom-center of the window.

/** Screen position of the sprite corner opposite to `corner`. */
function oppositeCorner(bounds, size, corner) {
  const left = bounds.x + (bounds.width - size) / 2;
  const top = bounds.y + bounds.height - size;
  return { x: corner.includes('w') ? left + size : left, y: corner.includes('n') ? top + size : top };
}

/** Sprite size for a cursor dragged away from the anchor: the larger axis wins. */
const sizeFromCursor = (anchor, cursor) =>
  resolveSize(Math.max(Math.abs(cursor.x - anchor.x), Math.abs(cursor.y - anchor.y)));

/** Window bounds that put a `size` sprite against `anchor`, growing towards the grabbed corner. */
function boundsFromAnchor(anchor, corner, size) {
  const left = corner.includes('w') ? anchor.x - size : anchor.x;
  const top = corner.includes('n') ? anchor.y - size : anchor.y;
  const { width, height } = windowSize(size);
  return { x: Math.round(left + size / 2 - width / 2), y: Math.round(top + size - height), width, height };
}

module.exports = {
  resolveSize,
  stepSize,
  windowSize,
  anchoredBounds,
  oppositeCorner,
  sizeFromCursor,
  boundsFromAnchor,
};
