const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toDay, fromDay, addDays } = require('../src/main/dates');

test('toDay formats local dates with zero padding', () => {
  assert.equal(toDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(toDay(new Date(2026, 11, 31)), '2026-12-31');
});

test('fromDay returns local midnight', () => {
  const d = fromDay('2026-03-09');
  assert.deepEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 2, 9, 0]);
});

test('toDay and fromDay round-trip', () => {
  assert.equal(toDay(fromDay('2024-02-29')), '2024-02-29');
});

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('addDays handles leap years and zero', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2025-02-28', 1), '2025-03-01');
  assert.equal(addDays('2026-06-15', 0), '2026-06-15');
  assert.equal(addDays('2026-01-01', 365), '2027-01-01');
});
