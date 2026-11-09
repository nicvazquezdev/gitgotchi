const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');
const { toDay, addDays } = require('../src/main/dates');

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
  assert.deepEqual(statuses[0].pause, { active: true, since: TODAY, backOn: null });
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
