const test = require('node:test');
const assert = require('node:assert/strict');
const { popoverBounds, toScreenRect } = require('../src/main/ui/popover-position');

const workArea = { x: 0, y: 25, width: 1440, height: 875 };
const size = { width: 360, height: 500 };
const pet = { x: 900, y: 700, width: 128, height: 128 };

const gap = 10;

test('popoverBounds goes above the pet, centered on it', () => {
  const b = popoverBounds({ anchor: pet, size, workArea });
  assert.equal(b.placement, 'above');
  assert.equal(b.y + b.height + gap, pet.y);
  assert.equal(b.x + b.width / 2, pet.x + pet.width / 2);
});

test('popoverBounds flips below the pet when there is no room above', () => {
  const b = popoverBounds({ anchor: { ...pet, y: 200 }, size, workArea });
  assert.equal(b.placement, 'below');
  assert.equal(b.y, 200 + 128 + gap);
});

test('popoverBounds stays inside the work area', () => {
  const edge = { x: 1340, y: 700, width: 128, height: 128 };
  assert.equal(popoverBounds({ anchor: edge, size, workArea }).x + size.width, 1440 - 8);
  assert.equal(popoverBounds({ anchor: { ...pet, x: -60 }, size, workArea }).x, 8);
});

test('popoverBounds aims the notch at the pet, wherever the popover had to move to fit', () => {
  assert.equal(popoverBounds({ anchor: pet, size, workArea }).aim, size.width / 2); // centered on the pet
  const edge = { x: 1240, y: 700, width: 128, height: 128 }; // pushed left to fit: the pet is right of the middle
  const b = popoverBounds({ anchor: edge, size, workArea });
  assert.ok(b.aim > size.width / 2);
  assert.equal(b.aim, edge.x + 64 - b.x);
  const left = popoverBounds({ anchor: { ...pet, x: 40 }, size, workArea }); // pushed right: the pet is left of it
  assert.ok(left.aim < size.width / 2);
  assert.equal(left.aim, 40 + 64 - left.x);
  const below = popoverBounds({ anchor: { ...edge, y: 200 }, size, workArea });
  assert.equal(below.placement, 'below');
  assert.equal(below.aim, edge.x + 64 - below.x);
});

test('popoverBounds keeps the notch on the flat of the shell, even when the pet is past it', () => {
  const far = { x: 1400, y: 700, width: 128, height: 128 }; // its center is beyond the popover's right inset
  assert.equal(popoverBounds({ anchor: far, size, workArea }).aim, size.width - 64);
  const off = popoverBounds({ anchor: { ...pet, x: -200 }, size, workArea });
  assert.equal(off.aim, 64);
  assert.equal(popoverBounds({ anchor: far, size, workArea, aimInset: 20 }).aim, size.width - 20);
});

test('popoverBounds is clamped vertically when it fits neither above nor below', () => {
  const anchor = { x: 500, y: 450, width: 128, height: 128 };
  const b = popoverBounds({ anchor, size: { width: 360, height: 800 }, workArea });
  assert.ok(b.y >= workArea.y && b.y + b.height <= workArea.y + workArea.height);
});

test('popoverBounds keeps its height; when it fits neither side it takes the side with more space', () => {
  const tall = { width: 360, height: 800 };
  const upper = popoverBounds({ anchor: { ...pet, y: 200 }, size: tall, workArea }); // more room below
  assert.equal(upper.placement, 'below');
  assert.equal(upper.height, 800);
  assert.equal(upper.y, workArea.y + workArea.height - 800); // below the pet, pulled up to the bottom of the screen
  const lower = popoverBounds({ anchor: { ...pet, y: 600 }, size: tall, workArea }); // more room above
  assert.equal(lower.placement, 'above');
  assert.equal(lower.height, 800);
  assert.equal(lower.y, workArea.y); // above the pet, pulled down to the top of the screen
  assert.equal(popoverBounds({ anchor: { ...pet, y: 200 }, size, workArea }).height, 500);
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
