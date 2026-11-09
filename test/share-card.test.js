const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { validRect, MIN, MAX } = require('../src/main/capture-rect');
const { computeStatus } = require('../src/main/game/engine');

// The renderer modules are ES modules; Node detects that and loads them.
const card = () => import(path.join(__dirname, '../src/renderer/share/share-card.js'));

test('the rectangle to copy has to be whole numbers inside the window, of a sensible size', () => {
  assert.deepEqual(validRect({ x: 10.4, y: 20.6, width: 512.2, height: 302.7 }), {
    x: 10,
    y: 21,
    width: 512,
    height: 303,
  });
  for (const bad of [
    null,
    undefined,
    {},
    { x: 0, y: 0, width: 'wide', height: 100 },
    { x: NaN, y: 0, width: 100, height: 100 },
    { x: Infinity, y: 0, width: 100, height: 100 },
    { x: -1, y: 0, width: 100, height: 100 }, // outside the window
    { x: 0, y: -5, width: 100, height: 100 },
    { x: 0, y: 0, width: MIN - 1, height: 100 }, // a speck
    { x: 0, y: 0, width: 100, height: MAX + 1 }, // the whole screen and more
  ]) {
    assert.equal(validRect(bad), null, JSON.stringify(bad));
  }
  assert.ok(validRect({ x: 0, y: 0, width: MIN, height: MAX }));
});

const pet = { species: 'phoenix', name: 'Pixel', bornAt: '2026-01-01T00:00:00Z', earned: {} };
const status = (days = {}) =>
  computeStatus(
    { pets: { phoenix: pet }, activePet: 'phoenix', activity: { days }, repos: [] },
    new Date(2026, 5, 15, 12), // a Monday
  );
const day = (counts) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, commits: 0, issues: 0, fastReviews: 0, ...counts });

test('the card shows three figures: pets, achievements and the streak', async () => {
  const { cardStats } = await card();
  const fresh = cardStats(status());
  assert.deepEqual(
    fresh.map((s) => s.label),
    ['Pets', 'Achievements', 'Day streak'],
  );
  assert.deepEqual(
    fresh.map((s) => s.value),
    ['1/8', '0/28', '0'],
  );
  const some = cardStats(status({ '2026-06-15': day({ prs: 1, prsXp: 10, reviews: 1, merges: 1 }) }));
  const byLabel = Object.fromEntries(some.map((s) => [s.label, s.value]));
  assert.equal(byLabel['Day streak'], '1');
  assert.match(byLabel.Achievements, /^\d+\/28$/);
});

test('every figure can be drawn in the bitmap font, and the longer ones get smaller pixels so they fit', async () => {
  const { cardStats, digitScale } = await card();
  const { digitRows } = await import(path.join(__dirname, '../src/renderer/shared/pixel-art.js'));
  for (const { value } of cardStats(status())) assert.ok(/^[0-9/]+$/.test(value), value);
  assert.deepEqual(
    ['3', '4/8', '170', '1250', '10/28', '100/100'].map((v) => digitScale(v)),
    [4, 4, 4, 4, 3, 2],
  );
  // the widest figure fits in a box of the card (about 97 px): width in grid columns times the scale
  const columns = (value) => digitRows(value)[0].length;
  for (const value of ['10/28', '100/100', '12500']) assert.ok(columns(value) * digitScale(value) <= 97, value);
});

test('the card has no repo, PR title or username on it', async () => {
  const { cardStats } = await card();
  const text = JSON.stringify(cardStats(status()));
  assert.ok(!/acme|github|login|title/i.test(text));
});
