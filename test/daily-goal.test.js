const test = require('node:test');
const assert = require('node:assert/strict');
const { dailyGoalView } = require('../src/main/game/daily-goal');
const { computeStatus } = require('../src/main/game/engine');
const { DAILY_GOAL, BASELINE } = require('../src/main/game/catalog');

test('the goal is a typical working day: the weekly baseline over five days', () => {
  assert.deepEqual(dailyGoalView({ baseline: 120, xp: 0, rest: false }), {
    xp: 0,
    goal: 24,
    reached: false,
    rest: false,
  });
  assert.equal(dailyGoalView({ baseline: 40, xp: 0, rest: false }).goal, 8); // the lowest baseline there is
  assert.equal(dailyGoalView({ baseline: 33, xp: 0, rest: false }).goal, Math.round(33 / DAILY_GOAL.workdays));
});

test('it is reached with exactly the goal, and keeps counting past it', () => {
  assert.equal(dailyGoalView({ baseline: 120, xp: 23, rest: false }).reached, false);
  assert.equal(dailyGoalView({ baseline: 120, xp: 24, rest: false }).reached, true);
  assert.deepEqual(dailyGoalView({ baseline: 120, xp: 70, rest: false }), {
    xp: 70,
    goal: 24,
    reached: true,
    rest: false,
  });
});

test('a rest day has no goal to miss or reach, but the XP of the day is still reported', () => {
  assert.deepEqual(dailyGoalView({ baseline: 120, xp: 0, rest: true }), {
    xp: 0,
    goal: null,
    reached: false,
    rest: true,
  });
  assert.deepEqual(dailyGoalView({ baseline: 120, xp: 30, rest: true }), {
    xp: 30,
    goal: null,
    reached: false,
    rest: true,
  });
});

// The status: 2026-06-15 is a Monday, 06-13 a Saturday.
const pet = { species: 'phoenix', name: 'Pixel', bornAt: '2026-01-01T00:00:00Z', earned: {} };
const statusOf = (days, now, timeOff = []) =>
  computeStatus({ pets: { phoenix: pet }, activePet: 'phoenix', activity: { days }, repos: [], timeOff }, now);
const day = (counts) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, commits: 0, issues: 0, fastReviews: 0, ...counts });

test('the status gives today’s XP against the goal of the person, on a working day', () => {
  const monday = new Date(2026, 5, 15, 12);
  const none = statusOf({}, monday).daily;
  assert.deepEqual(none, {
    xp: 0,
    goal: Math.round(BASELINE.defaultWeekly / DAILY_GOAL.workdays),
    reached: false,
    rest: false,
  });
  const some = statusOf({ '2026-06-15': day({ reviews: 2 }), '2026-06-14': day({ reviews: 9 }) }, monday).daily;
  assert.equal(some.xp, 20); // only today counts
  const enough = statusOf({ '2026-06-15': day({ reviews: 3 }) }, monday).daily;
  assert.deepEqual([enough.xp, enough.reached], [30, true]);
});

test('the goal follows the pace of the person: a busier person has a bigger goal', () => {
  const monday = new Date(2026, 5, 15, 12);
  const busy = {};
  for (let d = 1; d <= 14; d++) busy[`2026-06-${String(d).padStart(2, '0')}`] = day({ reviews: 20 }); // 200 XP a day
  assert.ok(statusOf(busy, monday).daily.goal > statusOf({}, monday).daily.goal);
});

test('on a weekend or a day of time off there is no goal', () => {
  const saturday = new Date(2026, 5, 13, 12);
  assert.deepEqual(statusOf({ '2026-06-13': day({ reviews: 1 }) }, saturday).daily, {
    xp: 10,
    goal: null,
    reached: false,
    rest: true,
  });
  const monday = new Date(2026, 5, 15, 12);
  assert.equal(statusOf({}, monday, [{ from: '2026-06-15', to: null }]).daily.rest, true);
  assert.equal(statusOf({}, monday, [{ from: '2026-06-01', to: '2026-06-12' }]).daily.rest, false);
});
