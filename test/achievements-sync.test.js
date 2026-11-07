const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');

// Like review-sync.test.js: the service talks to the store and to GitHub, so both are replaced.
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
  myTeams: async () => [],
  reviewRequests: async () => [],
  activity: async () => events,
  pullRequestsSince: async () => [],
  pushCommits: async () => [],
};
const review = (day = '2026-06-15') => ({ kind: 'reviews', repo: 'a/b', day });

let petService;
let announced;

beforeEach(() => {
  state = {
    user: { login: 'me' },
    repos: ['a/b'],
    pets: {
      phoenix: { species: 'phoenix', name: 'Pixel', bornAt: '2026-01-01T00:00:00Z', stageIndex: null, earned: {} },
    },
    activePet: 'phoenix',
    activity: emptyActivity(),
  };
  events = [];
  announced = [];
  delete require.cache[SERVICE];
  petService = require(SERVICE);
  petService.on('achievements', (list) => announced.push(list));
});

const recorded = () => Object.keys(state.achievements ?? {}).sort();

test('the first check only records what the pet already has: no celebration', async () => {
  state.activity.days = { '2026-05-01': { prs: 1, prsXp: 10, reviews: 3, merges: 0, commits: 0, issues: 0 } };
  await petService.sync();
  assert.deepEqual(recorded(), ['first-pr', 'first-review']);
  assert.deepEqual(announced, []);
});

test('with nothing yet it records an empty set, so the next ones are announced', async () => {
  await petService.sync();
  assert.deepEqual(state.achievements, {});
  events = [review()];
  await petService.sync();
  assert.deepEqual(announced, [
    [
      {
        id: 'first-review',
        name: 'First review',
        description: "Review someone else's pull request",
        icon: 'eye',
        tier: 'bronze',
        points: 10,
      },
    ],
  ]);
  assert.equal(state.achievements['first-review'], '2026-06-15');
});

test('an achievement is announced once', async () => {
  await petService.sync();
  events = [review()];
  await petService.sync();
  await petService.sync();
  assert.equal(announced.length, 1);
});

test('several reached at once are announced together', async () => {
  await petService.sync();
  events = Array.from({ length: 10 }, () => review());
  await petService.sync();
  assert.equal(announced.length, 1);
  assert.deepEqual(announced[0].map((a) => a.id).sort(), ['first-review', 'review-10']);
});

test('a reached achievement is kept when the history is rebuilt (e.g. other repos)', async () => {
  await petService.sync();
  events = [review()];
  await petService.sync();
  state.activity = emptyActivity();
  events = [];
  await petService.sync();
  assert.equal(petService.status().achievements.unlocked, 1);
  assert.equal(announced.length, 1); // and nothing is announced again
});

test('the live PR watcher also records and announces', async () => {
  await petService.sync();
  const pr = (over) => ({
    id: 'p1',
    number: 7,
    title: 't',
    url: 'u',
    repo: 'a/b',
    state: 'MERGED',
    isDraft: false,
    reviewDecision: null,
    ci: null,
    lines: 5,
    createdAt: new Date(Date.now() - 20 * 60000).toISOString(), // recent: the stored PR list prunes old merges
    mergedAt: new Date(Date.now() - 5 * 60000).toISOString(),
    ...over,
  });
  petService.applyPullRequests([pr()]);
  assert.deepEqual(
    announced
      .flat()
      .map((a) => a.id)
      .sort(),
    ['first-merge', 'first-pr', 'quick-merge'],
  );
});
