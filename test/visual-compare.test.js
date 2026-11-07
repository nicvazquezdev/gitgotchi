const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { compareBitmaps, CHANNEL_TOLERANCE } = require('../scripts/visual-compare');

/** A width x height bitmap of one color (B, G, R, A). */
const solid = (width, height, [b, g, r] = [10, 20, 30]) => {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set([b, g, r, 255], i);
  return { width, height, data };
};
const withPixel = (bitmap, x, [b, g, r]) => {
  const copy = { ...bitmap, data: Buffer.from(bitmap.data) };
  copy.data.set([b, g, r, 255], x * 4);
  return copy;
};

describe('compareBitmaps', () => {
  test('identical screenshots are the same', () => {
    const a = solid(20, 20);
    const result = compareBitmaps(a, solid(20, 20));
    assert.deepEqual([result.same, result.differing, result.total, result.ratio], [true, 0, 400, 0]);
  });

  test('a changed pixel is found and drawn in red over the dimmed screenshot', () => {
    const base = solid(10, 10, [100, 100, 100]);
    const actual = withPixel(base, 5, [100, 100, 250]);
    const result = compareBitmaps(base, actual, { maxRatio: 0 });
    assert.equal(result.differing, 1);
    assert.equal(result.same, false);
    assert.deepEqual([...result.diff.subarray(5 * 4, 5 * 4 + 4)], [0, 0, 255, 255], 'red');
    assert.deepEqual([...result.diff.subarray(0, 4)], [35, 35, 35, 255], 'the rest is dimmed');
  });

  test('a small difference in a channel is noise, a bigger one is not', () => {
    const base = solid(4, 4, [100, 100, 100]);
    assert.equal(
      compareBitmaps(base, withPixel(base, 0, [100 + CHANNEL_TOLERANCE, 100, 100]), { maxRatio: 0 }).differing,
      0,
    );
    assert.equal(
      compareBitmaps(base, withPixel(base, 0, [100 + CHANNEL_TOLERANCE + 1, 100, 100]), { maxRatio: 0 }).differing,
      1,
    );
  });

  test('a few different pixels are allowed up to the ratio, not beyond it', () => {
    const base = solid(100, 100); // 10 000 pixels: 5 may differ (0.05%)
    let actual = base;
    for (let x = 0; x < 5; x++) actual = withPixel(actual, x, [200, 200, 200]);
    assert.equal(compareBitmaps(base, actual).same, true);
    assert.equal(compareBitmaps(base, withPixel(actual, 5, [200, 200, 200])).same, false);
  });

  test('screenshots of different sizes are different, with no diff image', () => {
    const result = compareBitmaps(solid(10, 10), solid(10, 11));
    assert.deepEqual([result.same, result.sizeMismatch, result.diff], [false, true, null]);
  });

  test('the alpha channel is not compared', () => {
    const base = solid(4, 4);
    const actual = { ...base, data: Buffer.from(base.data) };
    actual.data[3] = 0;
    assert.equal(compareBitmaps(base, actual, { maxRatio: 0 }).differing, 0);
  });
});
