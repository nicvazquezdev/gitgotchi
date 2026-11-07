// The rectangle of a window that a page asks to copy as an image (pure, no Electron). The page is trusted, but it is
// still checked: whole pixels, inside the window, of a sensible size.
const MIN = 16;
const MAX = 2000;

/** @returns {{ x: number, y: number, width: number, height: number } | null}  null when it is not a usable rectangle */
function validRect(rect) {
  const { x, y, width, height } = rect ?? {};
  if (![x, y, width, height].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || width < MIN || height < MIN || width > MAX || height > MAX) return null;
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

module.exports = { validRect, MIN, MAX };
