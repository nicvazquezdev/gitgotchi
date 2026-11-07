const test = require('node:test');
const assert = require('node:assert/strict');
const { GLYPH, glyphBitmap, trayTitle } = require('../src/main/ui/tray-glyph');

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

test('trayTitle shows the waiting count only when there is one', () => {
  assert.equal(trayTitle(0), '');
  assert.equal(trayTitle(3), '3');
});
