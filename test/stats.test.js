const test = require('node:test');
const assert = require('node:assert/strict');
const { stats, streakLengths } = require('../src/main/game/stats');

const push = (n = 1) => ({ reviews: n });
const run = (days, today) => stats(days, new Date(`${today}T15:00:00`));

test('no history', () => {
  const s = run({}, '2026-03-10');
  assert.equal(s.streak, 0);
  assert.equal(s.bestStreak, 0);
});

test('streak counts consecutive days ending today', () => {
  const days = { '2026-03-08': push(), '2026-03-09': push(), '2026-03-10': push() };
  assert.equal(run(days, '2026-03-10').streak, 3);
});

test('empty today does not break the streak', () => {
  const days = { '2026-03-08': push(), '2026-03-09': push() };
  assert.equal(run(days, '2026-03-10').streak, 2);
});

test('empty yesterday and today means no streak', () => {
  assert.equal(run({ '2026-03-08': push() }, '2026-03-10').streak, 0);
});

test('a missed weekday ends the streak', () => {
  const days = {
    '2026-02-27': push(), // Fri
    '2026-03-02': push(), // Mon
    '2026-03-03': push(),
    '2026-03-04': push(), // Wed
    // Thu 5 missed
    '2026-03-06': push(), // Fri
    '2026-03-09': push(), // Mon
    '2026-03-10': push(), // Tue
  };
  const s = run(days, '2026-03-10');
  assert.equal(s.streak, 3);
  assert.equal(s.bestStreak, 4);
});

test('streak crosses month and year boundaries', () => {
  const ny = { '2025-12-30': push(), '2025-12-31': push(), '2026-01-01': push(), '2026-01-02': push() };
  assert.equal(run(ny, '2026-01-02').streak, 4);
  const feb = { '2026-02-27': push(), '2026-02-28': push(), '2026-03-01': push() };
  assert.equal(run(feb, '2026-03-01').streak, 3);
});

test('days with zero score do not count', () => {
  const days = { '2026-03-09': { reviews: 0, prs: 0 }, '2026-03-10': push() };
  assert.equal(run(days, '2026-03-10').streak, 1);
});

test('best streak looks at the whole history', () => {
  const days = { '2026-03-10': push() };
  for (const d of ['01', '02', '03', '04']) days[`2026-02-${d}`] = push();
  const s = run(days, '2026-03-10');
  assert.equal(s.bestStreak, 4);
  assert.equal(s.streak, 1);
});

// 2026-03-06 is a Friday, 07 Saturday, 08 Sunday, 09 Monday, 10 Tuesday.
test('a weekend without activity does not break the streak', () => {
  const days = { '2026-03-05': push(), '2026-03-06': push(), '2026-03-09': push(), '2026-03-10': push() };
  const s = run(days, '2026-03-10');
  assert.equal(s.streak, 4);
  assert.equal(s.bestStreak, 4);
});

test('a weekend day with activity counts', () => {
  const days = { '2026-03-06': push(), '2026-03-07': push(), '2026-03-09': push() };
  assert.equal(run(days, '2026-03-09').streak, 3);
  assert.equal(run({ '2026-03-06': push(), '2026-03-08': push(), '2026-03-09': push() }, '2026-03-09').streak, 3);
});

test('Monday morning: the streak from Friday is still alive, Tuesday morning it is not', () => {
  const days = { '2026-03-05': push(), '2026-03-06': push() };
  assert.equal(run(days, '2026-03-07').streak, 2); // Saturday
  assert.equal(run(days, '2026-03-08').streak, 2); // Sunday
  assert.equal(run(days, '2026-03-09').streak, 2); // Monday, nothing yet
  assert.equal(run(days, '2026-03-10').streak, 0); // Tuesday: Monday was missed
});

test('a missed Friday breaks it even if the weekend is free', () => {
  const days = { '2026-03-04': push(), '2026-03-05': push() }; // Wed, Thu
  assert.equal(run(days, '2026-03-09').streak, 0); // Monday morning: Friday was missed
});

test('best streak is counted with the same weekend rule', () => {
  const days = {
    '2026-02-26': push(), // Thu
    '2026-02-27': push(), // Fri
    '2026-03-02': push(), // Mon
    '2026-03-03': push(), // Tue
    // Wed 4 missed
    '2026-03-05': push(), // Thu
  };
  assert.equal(run(days, '2026-03-05').bestStreak, 4);
  assert.equal(run(days, '2026-03-05').streak, 1);
});

test('streakLengths gives the streak length on each active day', () => {
  const lengths = streakLengths(['2026-03-05', '2026-03-06', '2026-03-09', '2026-03-11']);
  assert.deepEqual(
    [...lengths],
    [
      ['2026-03-05', 1],
      ['2026-03-06', 2],
      ['2026-03-09', 3],
      ['2026-03-11', 1], // Tuesday 10 was missed
    ],
  );
});

// 2026-03-02 is a Monday, 03-09 the next one.
test('days of time off break nothing, like a weekend', () => {
  const days = { '2026-03-02': push(), '2026-03-03': push(), '2026-03-09': push(), '2026-03-10': push() };
  const off = (day) => day >= '2026-03-04' && day <= '2026-03-06'; // Wednesday to Friday
  const today = new Date('2026-03-10T15:00:00');
  assert.equal(stats(days, today).streak, 2, 'without time off the missed Wednesday starts over');
  const s = stats(days, today, off);
  assert.equal(s.streak, 4);
  assert.equal(s.bestStreak, 4);
});

test('back from time off: the streak lives until the first working day that is missed after it', () => {
  const days = { '2026-03-02': push(), '2026-03-03': push() };
  const off = (day) => day >= '2026-03-04' && day <= '2026-03-06';
  assert.equal(stats(days, new Date('2026-03-09T09:00:00'), off).streak, 2); // Monday morning: nothing yet
  assert.equal(stats(days, new Date('2026-03-10T09:00:00'), off).streak, 0); // Tuesday: Monday was missed
  // while the time off is on, the streak waits: today is off too
  const away = (day) => day >= '2026-03-04';
  assert.equal(stats(days, new Date('2026-03-12T09:00:00'), away).streak, 2);
});

test('streakLengths takes the time off into account too', () => {
  const lengths = streakLengths(['2026-03-03', '2026-03-09'], (day) => day >= '2026-03-04' && day <= '2026-03-06');
  assert.deepEqual(
    [...lengths],
    [
      ['2026-03-03', 1],
      ['2026-03-09', 2],
    ],
  );
});
