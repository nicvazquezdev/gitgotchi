const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');
const { petXp } = require('../src/main/game/collection');
const { WEIGHTS } = require('../src/main/game/catalog');
const { toDay } = require('../src/main/dates');

// Like review-sync.test.js: the service talks to the store and to GitHub, so both are replaced.
const src = (file) => path.join(__dirname, '../src/main', file);
const fake = (file, exports) => {
  require.cache[src(file)] = { id: src(file), filename: src(file), loaded: true, exports };
};

let state;
let queue;
let events;
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', { isConnected: () => true, client: async () => gh });
const SERVICE = src('services/pet-service.js');

const gh = {
  reviewRequests: async () => queue,
  myTeams: async () => [],
  activity: async () => events,
  pullRequestsSince: async () => [],
  pushCommits: async () => [],
};

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60000).toISOString();
const asked = (number, requestedAt, over = {}) => ({
  id: `pr${number}`,
  number,
  title: `PR ${number}`,
  url: `https://github.com/a/b/pull/${number}`,
  repo: 'a/b',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  lines: 20,
  author: 'ana',
  createdAt: minutesAgo(600),
  mergedAt: null,
  requestedAt,
  ...over,
});
const reviewed = (number, at) => ({ kind: 'reviews', repo: 'a/b', day: toDay(at), number, at });

let petService;

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
  queue = [];
  events = [];
  delete require.cache[SERVICE];
  petService = require(SERVICE);
});

const today = () => state.activity.days[toDay(new Date())];

test('a request is remembered when the queue is fetched, and kept after the PR leaves the queue', async () => {
  queue = [asked(1, minutesAgo(30)), asked(2, null)]; // the date of the second one could not be proved
  await petService.refreshReviews({ gh });
  assert.deepEqual(
    state.activity.requests.map((r) => [r.repo, r.number]),
    [['a/b', 1]],
  );
  queue = []; // the user reviewed it: it is not in the queue any more
  await petService.refreshReviews({ gh });
  assert.equal(state.activity.requests.length, 1);
});

test('a review within the hour of the request gives the bonus, once, on top of the review', async () => {
  queue = [asked(1, minutesAgo(30))];
  await petService.sync(); // sees the request
  queue = [];
  events = [reviewed(1, minutesAgo(10))]; // answered 20 minutes after being asked
  await petService.sync();
  assert.equal(today().reviews, 1);
  assert.equal(today().fastReviews, 1);
  assert.equal(petXp(state.pets.phoenix), WEIGHTS.reviews + WEIGHTS.fastReviews);
  assert.equal(state.activity.fastReviews.length, 1);
  // the same event in the next sync: nothing is counted twice
  await petService.sync();
  assert.equal(today().fastReviews, 1);
  assert.equal(petXp(state.pets.phoenix), WEIGHTS.reviews + WEIGHTS.fastReviews);
});

test('a slow review, or one nobody asked for, is a normal review without the bonus', async () => {
  queue = [asked(1, minutesAgo(300))];
  await petService.sync();
  queue = [];
  events = [reviewed(1, minutesAgo(10)), reviewed(9, minutesAgo(10))]; // 290 minutes later; and a voluntary one
  await petService.sync();
  assert.equal(today().reviews, 2);
  assert.equal(today().fastReviews, 0);
  assert.equal(petXp(state.pets.phoenix), 2 * WEIGHTS.reviews);
});

test('the first review of the day that unlocks the achievement is announced', async () => {
  const announced = [];
  petService.on('achievements', (list) => announced.push(...list.map((a) => a.id)));
  await petService.sync(); // the first check only records
  queue = [asked(1, minutesAgo(30))];
  await petService.sync();
  queue = [];
  events = [reviewed(1, minutesAgo(10))];
  await petService.sync();
  assert.ok(announced.includes('fast-review'), announced.join());
  assert.ok(announced.includes('first-review'));
});
