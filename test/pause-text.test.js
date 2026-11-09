const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const text = () => import(path.join(__dirname, '../src/renderer/shared/pause-text.js'));
const NOON = new Date(2026, 5, 15, 12); // Monday 2026-06-15

test('tomorrowOf gives the next day, across a month end', async () => {
  const { tomorrowOf } = await text();
  assert.equal(tomorrowOf(NOON), '2026-06-16');
  assert.equal(tomorrowOf(new Date(2026, 5, 30, 23)), '2026-07-01');
});

test('pauseKind tells the three lengths apart, and "off" when nothing is paused', async () => {
  const { pauseKind } = await text();
  assert.equal(pauseKind({ active: false, until: null, backOn: null }, NOON), 'off');
  assert.equal(pauseKind({ active: true, until: NOON.getTime() + 3600000, backOn: null }, NOON), 'hour');
  assert.equal(pauseKind({ active: true, until: null, backOn: '2026-06-16' }, NOON), 'tomorrow');
  assert.equal(pauseKind({ active: true, until: null, backOn: '2026-06-22' }, NOON), 'vacation');
  assert.equal(pauseKind({ active: true, until: null, backOn: null }, NOON), 'vacation');
});

test('pauseUntilText says when it ends in plain words', async () => {
  const { pauseUntilText } = await text();
  const at = new Date(2026, 5, 15, 15, 42).getTime();
  assert.equal(pauseUntilText({ until: at, backOn: null }, NOON), 'until 3:42 PM');
  assert.equal(pauseUntilText({ until: null, backOn: '2026-06-16' }, NOON), 'until tomorrow');
  assert.equal(pauseUntilText({ until: null, backOn: '2026-06-22' }, NOON), 'until Jun 22');
  assert.equal(pauseUntilText({ until: null, backOn: null }, NOON), 'until you resume');
});
