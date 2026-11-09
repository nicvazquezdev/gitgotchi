// Pure: the generic menu bar / tray icon (a chubby pixel creature: ears, big eyes with a highlight, a smile), as raw bitmaps.
const GLYPH = [
  '..##........##..',
  '..###......###..',
  '..####....####..',
  '..############..',
  '.##############.',
  '################',
  '#####.#####.####',
  '####..####..####',
  '####..####..####',
  '################',
  '######.##.######',
  '.######..######.',
  '.##############.',
  '..############..',
  '..####....####..',
  '..###......###..',
];

// One glyph pixel is one point (16x16 pt): whole device pixels at @1x and @2x stay crisp.
const POINTS_PER_PIXEL = 1;

/**
 * RGBA bitmap of the glyph. The default is black with alpha only: macOS template images use the alpha channel and
 * tint it to the menu bar. Windows and Linux have no templates, so they pass a color that reads on light and dark trays.
 * @param {number} scaleFactor  device pixels per point (1 or 2)
 * @param {number[]} color  [r, g, b]
 */
function glyphBitmap(scaleFactor, art = GLYPH, color = [0, 0, 0]) {
  const cell = POINTS_PER_PIXEL * scaleFactor;
  const width = art[0].length * cell;
  const height = art.length * cell;
  const buffer = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (art[Math.floor(y / cell)][Math.floor(x / cell)] === '#') buffer.set([...color, 255], (y * width + x) * 4);
  return { width, height, buffer, scaleFactor };
}

module.exports = { GLYPH, glyphBitmap };
