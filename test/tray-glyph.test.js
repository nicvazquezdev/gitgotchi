const test = require('node:test');
const assert = require('node:assert/strict');
const { GLYPH, glyphBitmap } = require('../src/main/ui/tray-glyph');

const alphaAt = ({ buffer, width }, x, y) => buffer[(y * width + x) * 4 + 3];

test('the glyph is a 14x14 pixel pet', () => {
  assert.equal(GLYPH.length, 14);
  assert.ok(GLYPH.every((row) => row.length === 14));
});

test('glyphBitmap is 14x14 points: whole device pixels at @1x and @2x', () => {
  const one = glyphBitmap(1);
  const two = glyphBitmap(2);
  assert.deepEqual([one.width, one.height, one.buffer.length], [14, 14, 14 * 14 * 4]);
  assert.deepEqual([two.width, two.height, two.scaleFactor], [28, 28, 2]);
});

test('glyphBitmap fills each glyph pixel as a solid square and leaves the gaps transparent', () => {
  const bmp = glyphBitmap(2); // each glyph pixel is 2x2 device pixels
  assert.equal(alphaAt(bmp, 4, 0), 255); // row 0, column 2: ear
  assert.equal(alphaAt(bmp, 0, 0), 0); // row 0, column 0: empty
  assert.equal(alphaAt(bmp, 6, 10), 0); // row 5, column 3: an eye
  assert.equal(alphaAt(bmp, 6, 6), 255); // row 3, column 3: body
});
