// Pure: the menu bar icon, the design's 9x7 pixel pet glyph, as raw bitmaps for macOS template images.
const GLYPH = ['..#####..', '.#######.', '#########', '##.###.##', '#########', '#########', '.##.#.##.'];

// The design draws the glyph at 2 points per pixel (18x14 pt): whole device pixels at @1x and @2x stay crisp.
const POINTS_PER_PIXEL = 2;

/**
 * RGBA bitmap of the glyph (black, alpha only: template images use the alpha channel).
 * @param {number} scaleFactor  device pixels per point (1 or 2)
 */
function glyphBitmap(scaleFactor, art = GLYPH) {
  const cell = POINTS_PER_PIXEL * scaleFactor;
  const width = art[0].length * cell;
  const height = art.length * cell;
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (art[Math.floor(y / cell)][Math.floor(x / cell)] === '#') buffer[(y * width + x) * 4 + 3] = 255;
  return { width, height, buffer, scaleFactor };
}

/** Text next to the icon: the number of PRs waiting for review, nothing when there are none. */
const trayTitle = (waitingCount) => (waitingCount > 0 ? String(waitingCount) : '');

module.exports = { GLYPH, glyphBitmap, trayTitle };
