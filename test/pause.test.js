const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pauseView, untilTomorrow, HOUR_MS } = require('../src/main/game/pause');

const TODAY = '2026-06-15';
const NOW = Date.UTC(2026, 5, 15, 12);
const NOT_PAUSED = { active: false, until: null, backOn: null, since: null };

test('nothing is paused by default', () => {
  assert.deepEqual(pauseView({ today: TODAY, now: NOW }), NOT_PAUSED);
});

test('an hour pause is on until its time and not a moment after', () => {
  const pausedUntil = NOW + HOUR_MS;
  assert.deepEqual(pauseView({ pausedUntil, today: TODAY, now: NOW }), {
    active: true,
    until: pausedUntil,
    backOn: null,
    since: null,
  });
  assert.deepEqual(pauseView({ pausedUntil, today: TODAY, now: pausedUntil }), NOT_PAUSED);
});

test('time off is a pause until the day the person is back (or until they resume)', () => {
  const away = pauseView({ timeOff: [{ from: '2026-06-12', to: '2026-06-18' }], today: TODAY, now: NOW });
  assert.deepEqual(away, { active: true, until: null, backOn: '2026-06-19', since: '2026-06-12' });
  const open = pauseView({ timeOff: [{ from: '2026-06-15', to: null }], today: TODAY, now: NOW });
  assert.deepEqual(open, { active: true, until: null, backOn: null, since: TODAY });
  assert.deepEqual(
    pauseView({ timeOff: [{ from: '2026-06-01', to: '2026-06-10' }], today: TODAY, now: NOW }),
    NOT_PAUSED,
  );
});

test('time off outranks the hour: it is the longer one', () => {
  const view = pauseView({
    pausedUntil: NOW + HOUR_MS,
    timeOff: [{ from: TODAY, to: '2026-06-16' }],
    today: TODAY,
    now: NOW,
  });
  assert.equal(view.until, null);
  assert.equal(view.backOn, '2026-06-17');
});

test('until tomorrow starts time off today with the return set to tomorrow, and keeps older time off', () => {
  assert.deepEqual(untilTomorrow([], TODAY), [{ from: TODAY, to: TODAY }]);
  const past = { from: '2026-06-01', to: '2026-06-03' };
  assert.deepEqual(untilTomorrow([past], TODAY), [past, { from: TODAY, to: TODAY }]);
  // a vacation that is on gets its return moved to tomorrow
  assert.deepEqual(untilTomorrow([{ from: '2026-06-10', to: null }], TODAY), [{ from: '2026-06-10', to: TODAY }]);
});
