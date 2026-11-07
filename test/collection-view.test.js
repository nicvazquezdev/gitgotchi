const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// The renderer modules are ES modules; Node detects that and loads them.
const view = () => import(path.join(__dirname, '../src/renderer/profile/collection-view.js'));

const entry = (id, over = {}) => ({
  id,
  hatched: true,
  active: false,
  mastered: false,
  name: id,
  level: 5,
  nextStageLevel: 10,
  xpToNextStage: 200,
  ...over,
});

test('paceText says how long the XP takes at the person’s pace, in days and then in weeks', async () => {
  const { paceText } = await view();
  assert.equal(paceText(5, 140), 'less than a day at your pace'); // 140 XP a week is 20 a day
  assert.equal(paceText(20, 140), 'about 1 day at your pace');
  assert.equal(paceText(60, 140), 'about 3 days at your pace');
  assert.equal(paceText(280, 140), 'about 2 weeks at your pace'); // 14 days is the first week count
  assert.equal(paceText(1000, 140), 'about 7 weeks at your pace');
  assert.equal(paceText(50, 0), 'about 50 weeks at your pace'); // no baseline: never divides by zero
});

test('nextEvolution is the hatched pet, not fully grown, with the least XP left to its next stage', async () => {
  const { nextEvolution } = await view();
  const entries = [
    entry('phoenix', { xpToNextStage: 300 }),
    entry('ram', { hatched: false }),
    entry('koi', { xpToNextStage: 40 }),
    entry('mushroom', { mastered: true, xpToNextStage: null }),
    entry('geode', { xpToNextStage: 90 }),
  ];
  assert.equal(nextEvolution(entries).id, 'koi');
  assert.equal(nextEvolution(entries.filter((e) => e.id !== 'koi')).id, 'geode');
  assert.equal(nextEvolution([entry('mushroom', { mastered: true }), entry('ram', { hatched: false })]), null);
  assert.equal(nextEvolution([]), null);
});

test('goalText names who evolves next and how far that is, or what is left to collect', async () => {
  const { goalText } = await view();
  const collection = (entries, hatched, total = 8) => ({ entries, hatched, total });
  assert.equal(
    goalText(collection([entry('koi', { name: 'Finn', nextStageLevel: 18, xpToNextStage: 280 })], 1), 140),
    'Finn evolves next, at level 18: 280 XP to go, about 2 weeks at your pace.',
  );
  const grown = [entry('mushroom', { mastered: true })];
  assert.match(goalText(collection(grown, 1), 140), /Hatch a new companion/);
  assert.match(goalText(collection(grown, 8), 140), /Hall of fame complete/);
});

test('gridMove: arrows move one card or one row, stop at the edges, Home and End jump', async () => {
  const { gridMove } = await view();
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
