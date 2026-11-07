const { test, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');

// Like the other service tests: the service talks to the store and to GitHub, so both are replaced.
const src = (file) => path.join(__dirname, '../src/main', file);
const fake = (file, exports) => {
  require.cache[src(file)] = { id: src(file), filename: src(file), loaded: true, exports };
};

let state;
let events;
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', { isConnected: () => true, client: async () => gh });
const SERVICE = src('services/pet-service.js');

const gh = {
  reviewRequests: async () => [],
  myTeams: async () => [],
  activity: async () => events,
  pullRequestsSince: async () => [],
  pushCommits: async () => [],
};

// A Monday at noon, whatever day the tests run: a weekend has no goal.
const NOW = new Date(2026, 5, 15, 12);
const TODAY = '2026-06-15';
const reviews = (n) => Array.from({ length: n }, () => ({ kind: 'reviews', repo: 'a/b', day: TODAY }));
// With no history the goal is a typical day of the default pace: 24 XP, that is three reviews.

let petService;
let heard;
const session = () => {
  // A new session of the app: a fresh service (it is a singleton) over the same saved state.
  delete require.cache[SERVICE];
  petService = require(SERVICE);
  heard = [];
  petService.on('goal', (info) => heard.push(info));
};

beforeEach(() => {
  mock.timers.enable({ apis: ['Date'], now: NOW });
  state = {
    user: { login: 'me' },
    repos: ['a/b'],
    pets: {
      phoenix: { species: 'phoenix', name: 'Pixel', bornAt: '2020-01-01T00:00:00Z', stageIndex: null, earned: {} },
    },
    activePet: 'phoenix',
    activity: emptyActivity(),
    goalDay: null,
  };
  events = [];
  session();
});

afterEach(() => mock.timers.reset());

test('the goal is announced when today’s XP reaches it during the session, once', async () => {
  await petService.sync(); // nothing yet
  assert.deepEqual(heard, []);
  events = reviews(2);
  await petService.sync(); // 20 XP of 24
  assert.deepEqual(heard, []);
  events = reviews(3);
  await petService.sync(); // 30 XP
  assert.deepEqual(heard, [{ xp: 30, goal: 24 }]);
  assert.equal(state.goalDay, TODAY);
  events = reviews(5);
  await petService.sync(); // more XP, the same day
  assert.equal(heard.length, 1);
});

test('a goal that was already reached when the session started is recorded, not announced', async () => {
  events = reviews(4);
  await petService.sync();
  assert.deepEqual(heard, []);
  assert.equal(state.goalDay, TODAY);
  events = reviews(6);
  await petService.sync();
  assert.deepEqual(heard, []);
});

test('it is announced again on another day, and not again after the app restarts the same day', async () => {
  state.goalDay = '2020-01-01'; // celebrated long ago
  await petService.sync();
  events = reviews(3);
  await petService.sync();
  assert.equal(heard.length, 1);
  session(); // the app restarts later the same day
  await petService.sync();
  events = reviews(9);
  await petService.sync();
  assert.deepEqual(heard, []);
});

test('on a day of time off there is no goal, so nothing is announced', async () => {
  state.timeOff = [{ from: TODAY, to: null }];
  await petService.sync();
  events = reviews(9);
  await petService.sync();
  assert.deepEqual(heard, []);
  assert.equal(state.goalDay, null);
});
