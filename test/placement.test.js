const { test } = require('node:test');
const assert = require('node:assert/strict');
const { centeredIn } = require('../src/main/ui/placement');

test('centers inside a secondary display with an offset origin', () => {
  const secondary = { x: 1728, y: -200, width: 2560, height: 1415 };
  assert.deepEqual(centeredIn(secondary, { width: 640, height: 860 }), { x: 1728 + 960, y: -200 + 278 });
});

test('a window bigger than the display sticks to its top-left corner', () => {
  const small = { x: 0, y: 25, width: 600, height: 700 };
  assert.deepEqual(centeredIn(small, { width: 640, height: 860 }), { x: 0, y: 25 });
});
