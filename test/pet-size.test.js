const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveSize,
  stepSize,
  windowSize,
  anchoredBounds,
  oppositeCorner,
  sizeFromCursor,
  boundsFromAnchor,
} = require('../src/main/ui/pet-size');
const { PET_WINDOW } = require('../src/main/config');

const area = { x: 0, y: 0, width: 1440, height: 900 };

test('resolveSize keeps whole pixels inside the range, default for junk', () => {
  assert.equal(resolveSize(192), 192);
  assert.equal(resolveSize(100.4), 100);
  assert.equal(resolveSize(10), 64);
  assert.equal(resolveSize(9999), 320);
  assert.equal(resolveSize(undefined), 128);
  assert.equal(resolveSize(NaN), 128);
});

test('stepSize moves one 32 px step and stops at both ends', () => {
  assert.equal(stepSize(128, 1), 160);
  assert.equal(stepSize(128, -1), 96);
  assert.equal(stepSize(64, -1), 64);
  assert.equal(stepSize(320, 1), 320);
  assert.equal(stepSize(128, 0), 128);
});

test('windowSize equals PET_WINDOW at the default size and grows with the sprite', () => {
  assert.deepEqual(windowSize(128), PET_WINDOW);
  assert.equal(windowSize(256).height, PET_WINDOW.height + 128);
  assert.equal(windowSize(256).width, PET_WINDOW.width + 128);
});

test('windowSize never gets narrower than the default width', () => {
  assert.equal(windowSize(96).width, PET_WINDOW.width);
  assert.equal(windowSize(96).height, PET_WINDOW.height - 32);
});

test('anchoredBounds keeps the bottom-center in place', () => {
  const bounds = { x: 600, y: 500, ...PET_WINDOW };
  const next = anchoredBounds(bounds, 256, area);
  assert.equal(next.x + next.width / 2, bounds.x + bounds.width / 2);
  assert.equal(next.y + next.height, bounds.y + bounds.height);
});

test('anchoredBounds is reversible when nothing is clamped', () => {
  const bounds = { x: 600, y: 500, ...PET_WINDOW };
  assert.deepEqual(anchoredBounds(anchoredBounds(bounds, 192, area), 128, area), bounds);
});

test('anchoredBounds keeps the window inside the work area', () => {
  const corner = { x: 1440 - PET_WINDOW.width, y: 900 - PET_WINDOW.height, ...PET_WINDOW };
  const next = anchoredBounds(corner, 256, area);
  assert.equal(next.x + next.width, 1440);
  assert.equal(next.y + next.height, 900);
  const top = anchoredBounds({ x: 0, y: 0, ...PET_WINDOW }, 256, area);
  assert.deepEqual([top.x, top.y], [0, 0]);
});

test('anchoredBounds respects a work area with an offset origin', () => {
  const offset = { x: -1920, y: 25, width: 1920, height: 1055 };
  const next = anchoredBounds({ x: -1920, y: 25, ...PET_WINDOW }, 192, offset);
  assert.deepEqual([next.x, next.y], [-1920, 25]);
});

// ---------- Corner resize ----------

const spriteBox = (bounds, size) => ({
  left: bounds.x + (bounds.width - size) / 2,
  top: bounds.y + bounds.height - size,
});

test('oppositeCorner returns the sprite corner facing the grabbed one', () => {
  const bounds = { x: 100, y: 100, ...windowSize(128) };
  const { left, top } = spriteBox(bounds, 128);
  assert.deepEqual(oppositeCorner(bounds, 128, 'nw'), { x: left + 128, y: top + 128 });
  assert.deepEqual(oppositeCorner(bounds, 128, 'se'), { x: left, y: top });
  assert.deepEqual(oppositeCorner(bounds, 128, 'ne'), { x: left, y: top + 128 });
});

test('sizeFromCursor follows the larger axis continuously, within the range', () => {
  assert.equal(sizeFromCursor({ x: 0, y: 0 }, { x: 150, y: 40 }), 150);
  assert.equal(sizeFromCursor({ x: 0, y: 0 }, { x: -20, y: -190 }), 190);
  assert.equal(sizeFromCursor({ x: 0, y: 0 }, { x: 5, y: 5 }), 64);
});

test('boundsFromAnchor keeps the opposite corner fixed for every grabbed corner', () => {
  const bounds = { x: 400, y: 300, ...windowSize(128) };
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const anchor = oppositeCorner(bounds, 128, corner);
    for (const size of [64, 150, 191, 320]) {
      const next = boundsFromAnchor(anchor, corner, size);
      assert.deepEqual(oppositeCorner(next, size, corner), anchor, `${corner} @ ${size}`);
    }
  }
});
