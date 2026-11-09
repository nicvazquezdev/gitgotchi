const test = require('node:test');
const assert = require('node:assert/strict');
const { popoverBounds, toScreenRect } = require('../src/main/ui/popover-position');

const workArea = { x: 0, y: 25, width: 1440, height: 875 };
const size = { width: 360, height: 500 };
const pet = { x: 900, y: 700, width: 128, height: 128 };

test('popoverBounds goes above the pet, centered on it, with the tail on the pet', () => {
  const b = popoverBounds({ anchor: pet, size, workArea });
  assert.equal(b.placement, 'above');
  assert.equal(b.y + b.height + 2, pet.y);
  assert.equal(b.x + b.width / 2, pet.x + pet.width / 2);
  assert.equal(b.tailX, 180);
});

test('popoverBounds flips below the pet when there is no room above', () => {
  const b = popoverBounds({ anchor: { ...pet, y: 200 }, size, workArea });
  assert.equal(b.placement, 'below');
  assert.equal(b.y, 200 + 128 + 2);
});

test('popoverBounds stays inside the work area and the tail keeps pointing at the pet', () => {
  const edge = { x: 1340, y: 700, width: 128, height: 128 };
  const b = popoverBounds({ anchor: edge, size, workArea });
  assert.equal(b.x + b.width, 1440 - 8);
  assert.equal(b.tailX, edge.x + 64 - b.x);
  const left = popoverBounds({ anchor: { ...pet, x: -60 }, size, workArea });
  assert.equal(left.x, 8);
  assert.equal(left.tailX, 28); // clamped: the tail never leaves the rounded card
});

test('popoverBounds is clamped vertically when it fits neither above nor below', () => {
  const anchor = { x: 500, y: 450, width: 128, height: 128 };
  const b = popoverBounds({ anchor, size: { width: 360, height: 800 }, workArea });
  assert.ok(b.y >= workArea.y && b.y + b.height <= workArea.y + workArea.height);
});

test('popoverBounds reports the room: the larger of the spaces above and below the pet', () => {
  assert.equal(popoverBounds({ anchor: pet, size, workArea }).room, 700 - 2 - (25 + 8)); // above is larger
  const top = { ...pet, y: 100 };
  assert.equal(popoverBounds({ anchor: top, size, workArea }).room, 25 + 875 - 8 - (100 + 128 + 2)); // below is
});

test('toScreenRect offsets a window-relative rect by the window origin', () => {
  const window = { x: 100, y: 50, width: 288, height: 320 };
  assert.deepEqual(toScreenRect(window, { x: 10, y: 20, width: 64, height: 64 }), {
    x: 110,
    y: 70,
    width: 64,
    height: 64,
  });
});
