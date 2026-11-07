const test = require('node:test');
const assert = require('node:assert/strict');
const { GLYPH, glyphBitmap } = require('../src/main/ui/tray-glyph');

const alphaAt = ({ buffer, width }, x, y) => buffer[(y * width + x) * 4 + 3];

test('the glyph is a 16x16 pixel pet', () => {
  assert.equal(GLYPH.length, 16);
  assert.ok(GLYPH.every((row) => row.length === 16));
});

test('glyphBitmap is 16x16 points: whole device pixels at @1x and @2x', () => {
  const one = glyphBitmap(1);
  const two = glyphBitmap(2);
  assert.deepEqual([one.width, one.height, one.buffer.length], [16, 16, 16 * 16 * 4]);
  assert.deepEqual([two.width, two.height, two.scaleFactor], [32, 32, 2]);
});

test('glyphBitmap fills each glyph pixel as a solid square and leaves the gaps transparent', () => {
  const bmp = glyphBitmap(2); // each glyph pixel is 2x2 device pixels
  assert.equal(alphaAt(bmp, 4, 0), 255); // row 0, column 2: ear
  assert.equal(alphaAt(bmp, 0, 0), 0); // row 0, column 0: empty
  assert.equal(alphaAt(bmp, 8, 16), 0); // row 8, column 4: an eye
  assert.equal(alphaAt(bmp, 8, 12), 255); // row 6, column 4: the eye highlight
});
