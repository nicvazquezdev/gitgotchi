const test = require('node:test');
const assert = require('node:assert/strict');
const { xpForLevel, levelAt, stageIndexFor } = require('../src/main/game/levels');
const { computeStatus, computeBaseline } = require('../src/main/game/engine');
const { BASELINE, STAGES, PR_SIZES } = require('../src/main/game/catalog');
const { sizeOf, openXp } = require('../src/main/game/pull-requests');
const { toDay, addDays } = require('../src/main/dates');

const NOW = new Date(2026, 5, 15, 14, 0, 0); // afternoon, the pet is awake
const TODAY = toDay(NOW);
const BORN = new Date(2026, 0, 1).toISOString();

/** `weeks` weeks of history ending today with `reviews` reviews a day (10 XP each). */
const history = (weeks, reviews) =>
  Object.fromEntries(Array.from({ length: weeks * 7 }, (_, i) => [addDays(TODAY, -i), { reviews }]));

const status = (days, pet = {}) =>
  computeStatus({ pet: { name: 'T', species: 'phoenix', bornAt: BORN, ...pet }, activity: { days, prs: [] } }, NOW);

test('PR size buckets: XS < 10, S < 100, M < 500, L from 500; XP 5/10/20/30', () => {
  const cases = [
    [0, 'XS', 5],
    [9, 'XS', 5],
    [10, 'S', 10],
    [99, 'S', 10],
    [100, 'M', 20],
    [499, 'M', 20],
    [500, 'L', 30],
    [100000, 'L', 30],
  ];
  for (const [lines, id, xp] of cases) {
    assert.equal(sizeOf(lines).id, id, `${lines} lines`);
    assert.equal(openXp(lines), xp, `${lines} lines`);
  }
  assert.equal(PR_SIZES.length, 4);
});

test('level costs are strictly increasing and level 1 starts at 0', () => {
  for (const baseline of [BASELINE.floorWeekly, BASELINE.defaultWeekly, 700]) {
    assert.equal(xpForLevel(1, baseline), 0);
    let prev = 0;
    for (let level = 2; level <= 60; level++) {
      const xp = xpForLevel(level, baseline);
      assert.ok(xp > prev, `level ${level} at baseline ${baseline}`);
      prev = xp;
    }
  }
});

test('stages unlock at levels 5, 10 and 18 after about 0.8, 3.5 and 9 typical weeks', () => {
  assert.deepEqual(
    STAGES.map((s) => s.level),
    [1, 5, 10, 18],
  );
  for (const baseline of [60, 120, 600]) {
    for (const [level, weeks] of [
      [5, 0.8],
      [10, 3.5],
      [18, 9],
    ]) {
      assert.equal(xpForLevel(level, baseline), Math.round(weeks * baseline));
    }
  }
  assert.deepEqual([4, 5, 9, 10, 17, 18, 40].map(stageIndexFor), [0, 1, 1, 2, 2, 3, 3]);
});

test('after level 18 the pace is steady, about 0.7 typical weeks per level', () => {
  const steps = [19, 20, 30].map((l) => xpForLevel(l, 1000) - xpForLevel(l - 1, 1000));
  for (const step of steps) assert.ok(Math.abs(step - 700) <= 1, `step ${step}`);
});

test('levelAt is the inverse of xpForLevel', () => {
  for (const baseline of [40, 120, 500]) {
    for (let level = 1; level <= 30; level++) {
      const start = xpForLevel(level, baseline);
      assert.equal(levelAt(start, baseline), level);
      assert.equal(levelAt(xpForLevel(level + 1, baseline) - 1, baseline), level);
    }
  }
});

test('levels are personal: light and heavy users reach the same level with the same typical weeks', () => {
  const light = status(history(4, 1)); // 70 XP/week
  const heavy = status(history(4, 8)); // 560 XP/week
  assert.equal(light.baseline, 70);
  assert.equal(heavy.baseline, 560);
  // Both did 4 typical weeks in the window: each is at the same level, with XP scaled to their baseline.
  assert.equal(light.level, heavy.level);
  assert.equal(light.stage.id, 'young');
  assert.ok(heavy.levelXpNeeded > light.levelXpNeeded * 7);
});

test('Adult after about nine typical weeks, for everyone', () => {
  for (const reviews of [1, 8]) {
    const weekly = reviews * 7 * 10;
    const base = history(4, reviews);
    const at = (weeks) => status({ ...base, [addDays(TODAY, -100)]: { reviews: (weeks * weekly) / 10 } });
    assert.notEqual(at(4.5).stage.id, 'adult'); // 4 weeks of history + 4.5 = 8.5
    const adult = at(5.5); // 9.5 typical weeks
    assert.equal(adult.stage.id, 'adult');
    assert.equal(adult.nextStage, null);
    assert.ok(adult.level >= 18);
  }
});

test('level progress stays within the level', () => {
  for (const reviews of [0, 1, 6, 53]) {
    for (const stageIndex of [null, 0, 2, 3]) {
      const s = status(history(4, reviews), { stageIndex });
      assert.ok(s.levelXp >= 0 && s.levelXp <= s.levelXpNeeded, `${reviews} ${stageIndex}`);
    }
  }
});

test('level and stage never go down when the baseline rises', () => {
  const calm = status({ ...history(4, 1), [addDays(TODAY, -100)]: { reviews: 300 } });
  assert.ok(calm.level >= 18);
  const intense = { ...history(4, 20), [addDays(TODAY, -100)]: { reviews: 300 } };
  const without = status(intense);
  assert.ok(without.level < calm.level, 'sanity: a higher baseline alone would demote');
  const floored = status(intense, { stageIndex: calm.stage.index, level: calm.level });
  assert.equal(floored.level, calm.level);
  assert.equal(floored.stage.index, calm.stage.index);
});

test('new user without usable history gets the default baseline', () => {
  assert.equal(computeBaseline({}, TODAY), BASELINE.defaultWeekly);
  assert.equal(computeBaseline({ [TODAY]: { reviews: 500 } }, TODAY), BASELINE.defaultWeekly);
  assert.equal(status({}).baseline, BASELINE.defaultWeekly);
});

test('baseline never drops below the floor', () => {
  assert.equal(computeBaseline(history(4, 0), TODAY), BASELINE.floorWeekly);
  assert.equal(computeBaseline({ ...history(4, 0), [TODAY]: { reviews: 1 } }, TODAY), BASELINE.floorWeekly);
});

test('baseline only looks at the last window of history, and ignores old kinds', () => {
  const days = { ...history(4, 1), [addDays(TODAY, -60)]: { reviews: 100000 } };
  assert.equal(computeBaseline(days, TODAY), 70);
  assert.equal(computeBaseline({ ...history(4, 1), [TODAY]: { reviews: 1, pushes: 999 } }, TODAY), 70);
});
