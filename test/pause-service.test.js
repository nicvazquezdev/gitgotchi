const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');
const { toDay, addDays } = require('../src/main/dates');
const { HOUR_MS } = require('../src/main/game/pause');

// Like the other service tests: the service talks to the store and to GitHub, so both are replaced.
const src = (file) => path.join(__dirname, '../src/main', file);
const fake = (file, exports) => {
  require.cache[src(file)] = { id: src(file), filename: src(file), loaded: true, exports };
};

let state;
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', { isConnected: () => true, client: async () => ({}) });
const SERVICE = src('services/pet-service.js');

const TODAY = toDay(new Date());
let petService;
let statuses;

beforeEach(() => {
  state = {
    user: { login: 'me' },
    repos: ['a/b'],
    pets: {
      phoenix: { species: 'phoenix', name: 'Pixel', bornAt: '2020-01-01T00:00:00Z', stageIndex: null, earned: {} },
    },
    activePet: 'phoenix',
    activity: emptyActivity(),
  };
  statuses = [];
  delete require.cache[SERVICE];
  petService = require(SERVICE);
  petService.on('status', (status) => statuses.push(status));
});

test('starting time off is saved from today, tells everyone, and the status says so', () => {
  assert.equal(petService.isOnTimeOff(), false);
  petService.startTimeOff();
  assert.deepEqual(state.timeOff, [{ from: TODAY, to: null }]);
  assert.equal(petService.isOnTimeOff(), true);
  assert.equal(statuses.length, 1);
  assert.deepEqual(statuses[0].pause, { active: true, until: null, since: TODAY, backOn: null });
});

test('starting it again, or ending what is not on, changes nothing and tells nobody', () => {
  petService.endTimeOff();
  assert.equal(statuses.length, 0);
  petService.startTimeOff();
  petService.startTimeOff();
  assert.equal(statuses.length, 1);
});

test('the return day is saved when it is a day after today, and cleared with null', () => {
  petService.startTimeOff();
  petService.setTimeOffReturn(addDays(TODAY, 5));
  assert.deepEqual(state.timeOff, [{ from: TODAY, to: addDays(TODAY, 4) }]);
  assert.deepEqual(petService.timeOff(), { active: true, since: TODAY, backOn: addDays(TODAY, 5) });
  const heard = statuses.length;
  for (const bad of [TODAY, addDays(TODAY, -3), 'next week', undefined]) petService.setTimeOffReturn(bad);
  assert.equal(statuses.length, heard, 'a day that is not valid changes nothing');
  assert.equal(state.timeOff[0].to, addDays(TODAY, 4));
  petService.setTimeOffReturn(null);
  assert.deepEqual(state.timeOff, [{ from: TODAY, to: null }]);
});

test('ending it means the person is back today: it lasted until yesterday, or never happened if it began today', () => {
  petService.startTimeOff();
  petService.endTimeOff();
  assert.deepEqual(state.timeOff, []);
  assert.equal(petService.isOnTimeOff(), false);
  state.timeOff = [{ from: addDays(TODAY, -3), to: null }];
  assert.equal(petService.isOnTimeOff(), true);
  petService.endTimeOff();
  assert.deepEqual(state.timeOff, [{ from: addDays(TODAY, -3), to: addDays(TODAY, -1) }]);
  assert.equal(petService.isOnTimeOff(), false);
});

test('pausing for an hour is a moment, not a day: it quiets the app and touches no streak', () => {
  const before = Date.now();
  petService.startPause('hour');
  assert.ok(state.pausedUntil >= before + HOUR_MS && state.pausedUntil <= Date.now() + HOUR_MS);
  assert.deepEqual(state.timeOff ?? [], [], 'no day of time off');
  assert.equal(petService.isPaused(), true);
  assert.equal(statuses.length, 1);
  assert.deepEqual(statuses[0].pause, { active: true, until: state.pausedUntil, backOn: null, since: null });
  petService.resume();
  assert.equal(state.pausedUntil, null);
  assert.equal(petService.isPaused(), false);
});

test('pausing until tomorrow is a day of time off with the return set to tomorrow', () => {
  petService.startPause('tomorrow');
  assert.deepEqual(state.timeOff, [{ from: TODAY, to: TODAY }]);
  assert.equal(state.pausedUntil ?? null, null);
  assert.deepEqual(petService.pause(), { active: true, until: null, since: TODAY, backOn: addDays(TODAY, 1) });
});

test('a vacation is time off with no set return, and the day back can be set later', () => {
  petService.startPause('vacation');
  assert.deepEqual(state.timeOff, [{ from: TODAY, to: null }]);
  petService.setTimeOffReturn(addDays(TODAY, 7));
  assert.equal(petService.pause().backOn, addDays(TODAY, 7));
});

test('a new pause replaces the one that was on, and resuming ends whichever is on', () => {
  petService.startPause('vacation');
  petService.startPause('hour');
  assert.deepEqual(state.timeOff, [], 'the vacation is over');
  assert.equal(petService.pause().until, state.pausedUntil);
  petService.startPause('tomorrow');
  assert.equal(state.pausedUntil, null, 'the hour is over');
  assert.equal(petService.pause().backOn, addDays(TODAY, 1));
  petService.resume();
  assert.equal(petService.isPaused(), false);
  assert.deepEqual(state.timeOff, []);
});

test('an unknown kind, pausing twice the same way, or resuming what is not paused tell nobody', () => {
  petService.startPause('forever');
  petService.resume();
  assert.equal(statuses.length, 0);
  petService.startPause('vacation');
  petService.startPause('vacation');
  assert.equal(statuses.length, 1);
});
