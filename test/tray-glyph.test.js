const test = require('node:test');
const assert = require('node:assert/strict');
const { GLYPH, glyphBitmap, scaleNearest, detailMask } = require('../src/main/ui/tray-glyph');

const alphaAt = ({ buffer, width }, x, y) => buffer[(y * width + x) * 4 + 3];

test('the glyph is the design 9x7 pet', () => {
  assert.equal(GLYPH.length, 7);
  assert.ok(GLYPH.every((row) => row.length === 9));
});

test('glyphBitmap is 18x14 points: whole device pixels at @1x and @2x', () => {
  const one = glyphBitmap(1);
  const two = glyphBitmap(2);
  assert.deepEqual([one.width, one.height, one.buffer.length], [18, 14, 18 * 14 * 4]);
  assert.deepEqual([two.width, two.height, two.scaleFactor], [36, 28, 2]);
});

test('glyphBitmap fills each glyph pixel as a solid square and leaves the gaps transparent', () => {
  const bmp = glyphBitmap(2); // each glyph pixel is 4x4 device pixels
  assert.equal(alphaAt(bmp, 8, 0), 255); // row 0, column 2: filled
  assert.equal(alphaAt(bmp, 11, 3), 255); // same cell, last pixel
  assert.equal(alphaAt(bmp, 0, 0), 0); // row 0, column 0: empty
  assert.equal(alphaAt(bmp, 8, 12), 0); // row 3, column 2: the eye gap
  assert.equal(alphaAt(bmp, 8, 11), 255); // row 2, column 2: filled
});

test('scaleNearest repeats each source pixel without blending', () => {
  const src = Buffer.from([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]); // 2x2
  const out = scaleNearest(src, 2, 4);
  assert.equal(out.length, 4 * 4 * 4);
  assert.deepEqual([out[0], out[4 * 4 - 4], out[4 * 4 * 3], out[out.length - 1]], [1, 2, 3, 4]);
});

test('detailMask cuts dark inner pixels but keeps the dark outline', () => {
  const side = 7;
  const px = Buffer.alloc(side * side * 4);
  for (let i = 0; i < side * side; i++) px.set([200, 200, 200, 255], i * 4); // light sprite filling the grid
  px.set([0, 0, 0, 255], (3 * side + 3) * 4); // dark pixel in the middle (an eye)
  px.set([0, 0, 0, 255], (0 * side + 3) * 4); // dark pixel on the edge (outline)
  const mask = detailMask(px, side);
  assert.equal(mask[(3 * side + 3) * 4 + 3], 0);
  assert.equal(mask[(0 * side + 3) * 4 + 3], 255);
  assert.equal(mask[(3 * side + 2) * 4 + 3], 255);
});
