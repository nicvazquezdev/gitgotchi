const test = require('node:test');
const assert = require('node:assert/strict');
const { panelBounds } = require('../src/main/ui/panel-position');

const workArea = { x: 0, y: 25, width: 1440, height: 875 };
const size = { width: 300, height: 400 };

test('panelBounds centers under the tray icon', () => {
  const icon = { x: 1000, y: 0, width: 24, height: 24 };
  const b = panelBounds({ anchor: icon, size, workArea });
  assert.equal(b.x + b.width / 2, 1012);
  assert.equal(b.y, 30);
  assert.deepEqual([b.width, b.height], [300, 400]);
});

test('panelBounds stays inside the work area horizontally', () => {
  const right = panelBounds({ anchor: { x: 1430, y: 0, width: 10, height: 24 }, size, workArea });
  assert.equal(right.x + right.width, 1440 - 8);
  const left = panelBounds({ anchor: { x: -50, y: 0, width: 10, height: 24 }, size, workArea });
  assert.equal(left.x, 8);
});

test('panelBounds flips above the anchor when it does not fit below', () => {
  const cursor = { x: 700, y: 800, width: 0, height: 0 };
  const b = panelBounds({ anchor: cursor, size, workArea });
  assert.equal(b.y + b.height, 800 - 6);
});

test('panelBounds clamps a panel taller than the space', () => {
  const b = panelBounds({
    anchor: { x: 0, y: 500, width: 0, height: 0 },
    size: { width: 300, height: 2000 },
    workArea,
  });
  assert.equal(b.y, workArea.y);
});

test('panelBounds respects a work area with an offset origin', () => {
  const second = { x: -1920, y: 0, width: 1920, height: 1080 };
  const b = panelBounds({ anchor: { x: -1900, y: 0, width: 20, height: 24 }, size, workArea: second });
  assert.equal(b.x, -1920 + 8);
});
