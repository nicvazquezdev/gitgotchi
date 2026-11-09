const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');

// The service talks to the store and to GitHub: replace both to see how the review requests are kept.
const src = (file) => path.join(__dirname, '../src/main', file);
const fake = (file, exports) => {
  require.cache[src(file)] = { id: src(file), filename: src(file), loaded: true, exports };
};

let state;
let gh;
let sessionCalls;
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', {
  isConnected: () => true,
  client: async () => (sessionCalls++, gh),
});
const SERVICE = src('services/pet-service.js');

const request = (id, over = {}) => ({
  id,
  number: Number(id),
  title: `PR ${id}`,
  url: `https://github.com/a/b/pull/${id}`,
  repo: 'a/b',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  lines: 20,
  author: 'ana',
  createdAt: '2026-06-15T10:00:00Z',
  requestedAt: new Date().toISOString(),
  mergedAt: null,
  ...over,
});

let petService;
let requests;

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
  requests = [request('1')];
  sessionCalls = 0;
  gh = {
    myTeams: async () => ['a/ui'],
    reviewRequests: async () => requests,
    activity: async () => [],
    pullRequestsSince: async () => [],
    pushCommits: async () => [],
  };
  // The service is a singleton: load a fresh one, so no test inherits another one's state.
  delete require.cache[SERVICE];
  petService = require(SERVICE);
});

const remembered = () => state.activity.requests.map((r) => r.number);

test('the requests are remembered with the day they were made, to tell later how fast the user answered', async () => {
  requests = [request('1'), request('2')];
  await petService.refreshReviews({ gh });
  assert.deepEqual(remembered(), [1, 2]);
});

test('the review requests are not part of the status: the app shows no queue', async () => {
  await petService.refreshReviews({ gh });
  assert.equal('reviewQueue' in petService.status(), false);
});

test('nothing is said about a new request: no activity and no attention event', async () => {
  const heard = [];
  petService.on('activity', (delta) => heard.push(delta));
  petService.on('attention', (items) => heard.push(items));
  await petService.refreshReviews({ gh });
  requests = [request('1'), request('2')];
  await petService.refreshReviews({ gh });
  assert.deepEqual(heard, []);
});

test('a failed fetch keeps what was remembered and does not throw', async () => {
  await petService.refreshReviews({ gh });
  gh.reviewRequests = async () => {
    throw new Error('GitHub 502');
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await petService.refreshReviews({ gh });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(remembered(), [1]);
});

test('with maxAgeMs a recent fetch is not repeated, and the client is only built when needed', async () => {
  let fetches = 0;
  gh.reviewRequests = async () => (fetches++, requests);
  await petService.refreshReviews({ maxAgeMs: 60_000 });
  await petService.refreshReviews({ maxAgeMs: 60_000 });
  assert.equal(fetches, 1);
  assert.equal(sessionCalls, 1);
  await petService.refreshReviews(); // no limit: always fetches
  assert.equal(fetches, 2);
});

test('the request is told who the user is and which teams they are in, and the teams are read once an hour', async () => {
  const asks = [];
  let teamReads = 0;
  gh.myTeams = async (login) => (teamReads++, login === 'me' ? ['a/ui', 'a/code'] : []);
  gh.reviewRequests = async (me) => (asks.push(me), requests);
  await petService.refreshReviews({ gh });
  await petService.refreshReviews({ gh });
  assert.deepEqual(asks, [
    { login: 'me', teams: ['a/ui', 'a/code'] },
    { login: 'me', teams: ['a/ui', 'a/code'] },
  ]);
  assert.equal(teamReads, 1);
});

test('when the teams cannot be read the requests still load, and the teams are tried again next time', async () => {
  let teamReads = 0;
  gh.myTeams = async () => {
    teamReads++;
    throw new Error('GitHub 403');
  };
  const asks = [];
  gh.reviewRequests = async (me) => (asks.push(me.teams), requests);
  const originalError = console.error;
  console.error = () => {};
  try {
    await petService.refreshReviews({ gh });
    await petService.refreshReviews({ gh });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(asks, [[], []]);
  assert.equal(teamReads, 2);
  assert.deepEqual(remembered(), [1]);
});

test('a sync fetches the requests along with the rest', async () => {
  await petService.sync();
  assert.deepEqual(remembered(), [1]);
});
