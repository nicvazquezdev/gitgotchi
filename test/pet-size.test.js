const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { resolveSize, windowSize, anchoredBounds } = require('../src/main/ui/pet-size');
const { PET_WINDOW, PET_CANVAS, PET_SIZE_RANGE, DEFAULT_PET_SIZE } = require('../src/main/config');
const animations = require('../assets/pets/animations.json');

const { min, max, step, box } = PET_SIZE_RANGE;
const D = DEFAULT_PET_SIZE;
const area = { x: 0, y: 0, width: 1440, height: 900 };

test('resolveSize snaps to the nearest step inside the range, default for junk', () => {
  assert.equal(resolveSize(D + step / 2 - 1), D);
  assert.equal(resolveSize(D + step / 2 + 1), D + step);
  assert.equal(resolveSize(D + step), D + step);
  assert.equal(resolveSize(D * 1.05), D + step);
  assert.equal(resolveSize(104), 104); // sizes saved when the steps were 52 px
  assert.equal(resolveSize(min - 50), min);
  assert.equal(resolveSize(max + 50), max);
  assert.equal(resolveSize(undefined), D);
  assert.equal(resolveSize(NaN), D);
});

test('the steps are 5% of the default size and the default is one of them', () => {
  assert.ok(Math.abs(step - D / 20) < 1e-9);
  assert.equal(resolveSize(D), D);
  assert.equal(Math.round((D - min) / step) * step + min, D);
});

test('windowSize equals PET_WINDOW at the default size and grows with the pet, in whole px', () => {
  assert.deepEqual(windowSize(D), PET_WINDOW);
  assert.deepEqual(windowSize(D + 5 * step), {
    width: PET_WINDOW.width + 52,
    height: PET_WINDOW.height + 52,
  });
  for (let size = min; size <= max; size += step) {
    const { width, height } = windowSize(size);
    assert.ok(Number.isInteger(width) && Number.isInteger(height), `size ${size}`);
  }
});

test('windowSize is always tall enough for the whole canvas, even at the biggest sizes', () => {
  for (let size = min; size <= max + 1e-6; size += step) {
    assert.ok(windowSize(size).height >= PET_CANVAS.rows * (resolveSize(size) / box), `size ${size}`);
  }
  assert.equal(windowSize(max).height, PET_CANVAS.rows * (max / box));
});

test('the renderer builds the same canvas as the window expects', () => {
  const view = fs.readFileSync(path.join(__dirname, '../src/renderer/pet/pet-view.js'), 'utf8');
  const constant = (name) => Number(new RegExp(`const ${name} = (\\d+);`).exec(view)?.[1]);
  assert.equal(constant('HEADROOM'), PET_CANVAS.headroom);
  assert.equal(constant('BELOW'), PET_CANVAS.below);
  assert.equal(constant('PX_PER_SCALE'), PET_SIZE_RANGE.box);
});

test('the canvas rows are the headroom, the lowest floor line of any stage and the margin under it', () => {
  const lowestFloor = Math.max(
    ...animations.lines.flatMap((line) => line.stages.map(({ shadowEllipse: e }) => Math.ceil(e.cy + e.ry))),
  );
  assert.equal(PET_CANVAS.rows, PET_CANVAS.headroom + lowestFloor + PET_CANVAS.below);
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
  assert.deepEqual(anchoredBounds(anchoredBounds(bounds, D + step, area), D, area), bounds);
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
  const next = anchoredBounds({ x: -1920, y: 25, ...PET_WINDOW }, D + step, offset);
  assert.deepEqual([next.x, next.y], [-1920, 25]);
});
