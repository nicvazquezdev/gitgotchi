const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSize, windowSize, anchoredBounds } = require('../src/main/ui/pet-size');
const { PET_WINDOW, PET_SIZE_RANGE, DEFAULT_PET_SIZE } = require('../src/main/config');

const { min, max } = PET_SIZE_RANGE;
const D = DEFAULT_PET_SIZE;
const area = { x: 0, y: 0, width: 1440, height: 900 };

test('resolveSize keeps whole pixels inside the range, default for junk', () => {
  assert.equal(resolveSize(D + 10.4), D + 10);
  assert.equal(resolveSize(min - 50), min);
  assert.equal(resolveSize(max + 50), max);
  assert.equal(resolveSize(undefined), D);
  assert.equal(resolveSize(NaN), D);
});

test('windowSize equals PET_WINDOW at the default size and grows with the pet', () => {
  assert.deepEqual(windowSize(D), PET_WINDOW);
  assert.deepEqual(windowSize(D + 100), { width: PET_WINDOW.width + 100, height: PET_WINDOW.height + 100 });
});

test('windowSize never gets narrower than the default width', () => {
  assert.equal(windowSize(min).width, PET_WINDOW.width);
  assert.equal(windowSize(min).height, PET_WINDOW.height - (D - min));
});

test('anchoredBounds keeps the bottom-center in place', () => {
  const bounds = { x: 600, y: 300, ...PET_WINDOW };
  const next = anchoredBounds(bounds, max, area);
  assert.equal(next.x + next.width / 2, bounds.x + bounds.width / 2);
  assert.equal(next.y + next.height, bounds.y + bounds.height);
});

test('anchoredBounds is reversible when nothing is clamped', () => {
  const bounds = { x: 600, y: 300, ...PET_WINDOW };
  assert.deepEqual(anchoredBounds(anchoredBounds(bounds, D + 60, area), D, area), bounds);
});

test('anchoredBounds keeps the window inside the work area', () => {
  const corner = { x: 1440 - PET_WINDOW.width, y: 900 - PET_WINDOW.height, ...PET_WINDOW };
  const next = anchoredBounds(corner, max, area);
  assert.equal(next.x + next.width, 1440);
  assert.equal(next.y + next.height, 900);
  const top = anchoredBounds({ x: 0, y: 0, ...PET_WINDOW }, max, area);
  assert.deepEqual([top.x, top.y], [0, 0]);
});

test('anchoredBounds respects a work area with an offset origin', () => {
  const offset = { x: -1920, y: 25, width: 1920, height: 1055 };
  const next = anchoredBounds({ x: -1920, y: 25, ...PET_WINDOW }, D + 40, offset);
  assert.deepEqual([next.x, next.y], [-1920, 25]);
});
