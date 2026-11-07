const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isDay,
  isOffDay,
  activeRange,
  startTimeOff,
  endTimeOff,
  setReturn,
  timeOffView,
  mergeTimeOff,
} = require('../src/main/game/time-off');

const TODAY = '2026-06-15'; // a Monday

test('isDay accepts real calendar days only', () => {
  assert.ok(isDay('2026-06-15') && isDay('2024-02-29'));
  for (const bad of ['2026-02-30', '2026-6-15', '15/06/2026', '', null, undefined, 20260615, '2026-06-15T10:00']) {
    assert.equal(isDay(bad), false, String(bad));
  }
});

test('a range covers its days, both ends included; an open one lasts until today', () => {
  const ranges = [
    { from: '2026-06-01', to: '2026-06-05' },
    { from: '2026-06-12', to: null },
  ];
  assert.deepEqual(
    ['2026-05-31', '2026-06-01', '2026-06-05', '2026-06-06', '2026-06-12', '2026-06-15', '2026-06-16'].map((d) =>
      isOffDay(ranges, d, TODAY),
    ),
    [false, true, true, false, true, true, false], // the open range does not reach tomorrow
  );
  assert.equal(isOffDay([], TODAY, TODAY), false);
});

test('starting time off is today, once; ending it means the person is back today', () => {
  const started = startTimeOff([], TODAY);
  assert.deepEqual(started, [{ from: TODAY, to: null }]);
  assert.equal(startTimeOff(started, TODAY), started); // already on: nothing changes
  assert.deepEqual(timeOffView(started, TODAY), { active: true, since: TODAY, backOn: null });

  // started three days ago: it lasted until yesterday
  const ranges = [{ from: '2026-06-12', to: null }];
  assert.deepEqual(endTimeOff(ranges, TODAY), [{ from: '2026-06-12', to: '2026-06-14' }]);
  assert.equal(isOffDay(endTimeOff(ranges, TODAY), TODAY, TODAY), false);
  // started today and ended today: nothing was off
  assert.deepEqual(endTimeOff(started, TODAY), []);
  assert.equal(endTimeOff([], TODAY).length, 0);
});

test('a time off that already ended is not active, and a new one can start', () => {
  const past = [{ from: '2026-06-01', to: '2026-06-05' }];
  assert.equal(activeRange(past, TODAY), null);
  assert.deepEqual(startTimeOff(past, TODAY), [...past, { from: TODAY, to: null }]);
  assert.deepEqual(timeOffView(past, TODAY), { active: false, since: null, backOn: null });
});

test('the return day is the first day that counts again, and has to be a real day after today', () => {
  const on = [{ from: '2026-06-12', to: null }];
  const back = setReturn(on, TODAY, '2026-06-22');
  assert.deepEqual(back, [{ from: '2026-06-12', to: '2026-06-21' }]);
  assert.deepEqual(timeOffView(back, TODAY), { active: true, since: '2026-06-12', backOn: '2026-06-22' });
  assert.equal(isOffDay(back, '2026-06-21', TODAY), true);
  assert.equal(isOffDay(back, '2026-06-22', TODAY), false);
  // cleared again
  assert.deepEqual(setReturn(back, TODAY, null), on);
  // not a later day, not a day, or time off is not on: nothing changes
  for (const bad of [TODAY, '2026-06-10', '2026-02-30', 'soon', undefined]) assert.equal(setReturn(on, TODAY, bad), on);
  const off = [];
  assert.equal(setReturn(off, TODAY, '2026-06-22'), off);
});

test('merging two computers: one range per start, the earlier end wins, an ended range does not come back open', () => {
  const a = [
    { from: '2026-06-01', to: '2026-06-05' },
    { from: '2026-06-12', to: null },
  ];
  const b = [
    { from: '2026-06-12', to: '2026-06-14' },
    { from: '2026-05-01', to: '2026-05-03' },
  ];
  assert.deepEqual(mergeTimeOff(a, b), [
    { from: '2026-05-01', to: '2026-05-03' },
    { from: '2026-06-01', to: '2026-06-05' },
    { from: '2026-06-12', to: '2026-06-14' }, // ended on one computer: it stays ended
  ]);
  assert.deepEqual(mergeTimeOff([{ from: 'x', to: '2026-06-20' }], [{ from: 'x', to: '2026-06-18' }]), [
    { from: 'x', to: '2026-06-18' },
  ]);
  assert.deepEqual(mergeTimeOff(undefined, undefined), []);
});
