const test = require('node:test');
const assert = require('node:assert/strict');
const { computeStatus, computeBaseline } = require('../src/main/game/engine');
const { BASELINE } = require('../src/main/game/catalog');
const { toDay, addDays } = require('../src/main/dates');

const NOW = new Date(2026, 5, 15, 14, 0, 0); // afternoon, pet is awake
const TODAY = toDay(NOW);
const BORN = new Date(2026, 0, 1).toISOString();

/** `weeks` weeks of history ending today, `pushes` pushes per day (1 point each). */
const history = (weeks, pushes) =>
  Object.fromEntries(Array.from({ length: weeks * 7 }, (_, i) => [addDays(TODAY, -i), { pushes }]));

const status = (days, pet = {}, now = NOW) =>
  computeStatus({ pet: { name: 'T', species: 'blob', bornAt: BORN, ...pet }, activity: { days } }, now);

/** Same history, but the last 7 days scaled to `ratio` of a normal week. */
function withWeekRatio(perDay, ratio) {
  const days = history(4, perDay);
  for (let i = 0; i < 7; i++) days[addDays(TODAY, -i)] = { pushes: perDay * ratio };
  return days;
}

test('light and heavy users get the same mood and hearts for the same relative effort', () => {
  const light = status(history(4, 6)); // 42 pts/week
  const heavy = status(history(4, 53)); // 371 pts/week
  assert.equal(light.baseline, 42);
  assert.equal(heavy.baseline, 371);
  assert.equal(light.mood, 'happy');
  assert.equal(heavy.mood, 'happy');
  assert.equal(light.hearts, heavy.hearts);
});

test('relative effort drives mood: 0.2x is sad, 0.6x is idle, for light and heavy users', () => {
  for (const perDay of [10, 50]) {
    assert.equal(status(withWeekRatio(perDay, 0.2)).mood, 'sad');
    assert.equal(status(withWeekRatio(perDay, 0.6)).mood, 'idle');
  }
});

test('new user without usable history gets the default baseline', () => {
  assert.equal(computeBaseline({}, TODAY), BASELINE.defaultWeekly);
  assert.equal(computeBaseline({ [TODAY]: { pushes: 500 } }, TODAY), BASELINE.defaultWeekly);
  assert.equal(status({}).baseline, BASELINE.defaultWeekly);
});

test('baseline never drops below the floor', () => {
  assert.equal(computeBaseline(history(4, 0), TODAY), BASELINE.floorWeekly);
  assert.equal(computeBaseline(history(4, 1), TODAY), BASELINE.floorWeekly);
});

test('baseline only looks at the last window of history', () => {
  const days = { ...history(4, 10), [addDays(TODAY, -60)]: { pushes: 100000 } };
  assert.equal(computeBaseline(days, TODAY), 70);
});

test('status exposes personalized thresholds that scale with the baseline', () => {
  const light = status(history(4, 6), { stageIndex: 0 });
  const heavy = status(history(4, 53), { stageIndex: 0 });
  // Same number of "typical weeks" to the next stage, so XP scales with the baseline.
  assert.ok(Math.abs(heavy.nextStage.minXp / heavy.baseline - light.nextStage.minXp / light.baseline) < 0.05);
});

test('Adult takes about nine typical weeks for everyone', () => {
  for (const perDay of [6, 53]) {
    const days = history(4, perDay);
    const weekly = perDay * 7;
    const justShort = { ...days, [addDays(TODAY, -100)]: { pushes: weekly * 4 } };
    const enough = { ...days, [addDays(TODAY, -100)]: { pushes: weekly * 5 } };
    assert.notEqual(status(justShort).stage.id, 'adult');
    const adult = status(enough);
    assert.equal(adult.stage.id, 'adult');
    assert.equal(adult.nextStage, null);
    assert.equal(adult.progress, 1);
  }
});

test('stage never goes backwards when the baseline rises', () => {
  const calm = history(4, 3);
  const before = status({ ...calm, [addDays(TODAY, -100)]: { pushes: 500 } });
  assert.ok(before.stage.index >= 3);
  const intense = { ...history(4, 60), [addDays(TODAY, -100)]: { pushes: 500 } };
  const without = status(intense);
  const floored = status(intense, { stageIndex: before.stage.index });
  assert.ok(without.stage.index < before.stage.index, 'sanity: a higher baseline alone would demote');
  assert.equal(floored.stage.index, before.stage.index);
});

test('progress stays within [0, 1]', () => {
  for (const perDay of [0, 1, 6, 53, 300]) {
    for (const stageIndex of [null, 0, 2, 4]) {
      const { progress } = status(history(4, perDay), { stageIndex });
      assert.ok(progress >= 0 && progress <= 1, `progress ${progress}`);
    }
  }
});

test('sleeping hours still win over mood', () => {
  assert.equal(status(history(4, 6), {}, new Date(2026, 5, 15, 3)).mood, 'sleeping');
});
