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

/**
 * Nearest-neighbor scale of a square 4-byte-per-pixel bitmap (keeps pixel art sharp; channel order is untouched).
 * @param {Buffer} src  side x side pixels
 * @returns {Buffer}    target x target pixels
 */
function scaleNearest(src, side, target) {
  const out = Buffer.alloc(target * target * 4);
  for (let y = 0; y < target; y++)
    for (let x = 0; x < target; x++) {
      const from = (Math.floor((y * side) / target) * side + Math.floor((x * side) / target)) * 4;
      src.copy(out, (y * target + x) * 4, from, from + 4);
    }
  return out;
}

const EYE_DEPTH = 2; // a dark pixel only becomes a hole when this many pixels away from the sprite's edge
const EYE_LUMA = 60; // darker than this (0-255) counts as dark

/**
 * Template-image mask of a sprite: its silhouette with the dark inner details (eyes, mouth) cut out, so they show
 * the menu bar background. The outline stays solid. Output is black with alpha only, same size as the input.
 * @param {Buffer} bgra  side x side pixels in BGRA order (what nativeImage.toBitmap returns on macOS)
 */
function detailMask(bgra, side) {
  const alphaAt = (x, y) => (x >= 0 && y >= 0 && x < side && y < side ? bgra[(y * side + x) * 4 + 3] : 0);
  const out = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4;
      if (bgra[i + 3] < 128) continue;
      let deep = true;
      for (let dy = -EYE_DEPTH; dy <= EYE_DEPTH && deep; dy++)
        for (let dx = -EYE_DEPTH; dx <= EYE_DEPTH; dx++) if (alphaAt(x + dx, y + dy) < 128) deep = false;
      const luma = 0.114 * bgra[i] + 0.587 * bgra[i + 1] + 0.299 * bgra[i + 2];
      if (!(deep && luma < EYE_LUMA)) out[i + 3] = 255;
    }
  return out;
}

module.exports = { GLYPH, glyphBitmap, scaleNearest, detailMask };
