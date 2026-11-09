const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const text = () => import(path.join(__dirname, '../src/renderer/shared/vacation-text.js'));
const NOON = new Date(2026, 5, 15, 12); // Monday 2026-06-15

test('tomorrowOf gives the next day, across a month end', async () => {
  const { tomorrowOf } = await text();
  assert.equal(tomorrowOf(NOON), '2026-06-16');
  assert.equal(tomorrowOf(new Date(2026, 5, 30, 23)), '2026-07-01');
});

test('vacationUntilText says when it ends in plain words', async () => {
  const { vacationUntilText } = await text();
  assert.equal(vacationUntilText({ backOn: '2026-06-16' }, NOON), 'until tomorrow');
  assert.equal(vacationUntilText({ backOn: '2026-06-22' }, NOON), 'until Jun 22');
  assert.equal(vacationUntilText({ backOn: null }, NOON), 'until you are back');
});
