const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// The renderer modules are ES modules; Node detects that and loads them.
const grid = () => import(pathToFileURL(path.join(__dirname, '../src/renderer/popover/grid.js')).href);

test('gridMove: arrows move one card or one row, stop at the edges, Home and End jump', async () => {
  const { gridMove } = await grid();
  const move = (index, key) => gridMove(index, key, 8, 4);
  assert.equal(move(1, 'ArrowRight'), 2);
  assert.equal(move(1, 'ArrowLeft'), 0);
  assert.equal(move(1, 'ArrowDown'), 5);
  assert.equal(move(5, 'ArrowUp'), 1);
  assert.equal(move(0, 'ArrowLeft'), 0); // the first card has nothing before it
  assert.equal(move(7, 'ArrowRight'), 7);
  assert.equal(move(6, 'ArrowDown'), 6); // no row below
  assert.equal(move(2, 'ArrowUp'), 2); // no row above
  assert.equal(move(5, 'Home'), 0);
  assert.equal(move(2, 'End'), 7);
  assert.equal(move(3, 'a'), 3); // any other key stays
});

test('gridMove works for any width: the trophies are 7 across', async () => {
  const { gridMove } = await grid();
  assert.equal(gridMove(2, 'ArrowDown', 28, 7), 9);
  assert.equal(gridMove(9, 'ArrowUp', 28, 7), 2);
  assert.equal(gridMove(25, 'ArrowDown', 28, 7), 25); // the last row has nothing below
});
