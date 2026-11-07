const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');

// The service talks to the store and to GitHub: replace both to see how the review queue is kept.
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
  number: 1,
  title: `PR ${id}`,
  url: `https://github.com/a/b/pull/${id}`,
  repo: 'a/b',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  lines: 20,
  author: 'ana',
  createdAt: '2026-06-15T10:00:00Z',
  mergedAt: null,
  ...over,
});

let petService;
let requests;
let activities;
let attentions;

beforeEach(() => {
  state = {
    user: { login: 'me' },
    repos: ['a/b'],
    pet: { species: 'phoenix', name: 'Pixel', bornAt: '2026-01-01T00:00:00Z', stageIndex: null },
    activity: emptyActivity(),
  };
  requests = [request('1')];
  activities = [];
  attentions = [];
  sessionCalls = 0;
  gh = {
    myTeams: async () => ['a/ui'],
    reviewRequests: async () => requests,
    activity: async () => [],
    pullRequestsSince: async () => [],
    pushCommits: async () => [],
  };
  // The service is a singleton: load a fresh one, so no test inherits another one's queue.
  delete require.cache[SERVICE];
  petService = require(SERVICE);
  petService.on('activity', (delta) => activities.push(delta));
  petService.on('attention', (items) => attentions.push(items));
});

const queueIds = () => petService.status().reviewQueue?.map((pr) => pr.id);

test('the queue is null until the first fetch, then the selected repos oldest first', async () => {
  assert.equal(petService.status().reviewQueue, null);
  requests = [request('new', { createdAt: '2026-06-15T12:00:00Z' }), request('old'), request('other', { repo: 'x/y' })];
  await petService.refreshReviews({ gh });
  assert.deepEqual(queueIds(), ['old', 'new']);
});

test('the first fetch is a baseline; a request that shows up later is reported once', async () => {
  await petService.refreshReviews({ gh });
  assert.deepEqual(activities, []);
  requests = [request('1'), request('2')];
  await petService.refreshReviews({ gh });
  assert.deepEqual(activities, [{ reviewRequests: 1 }]);
  await petService.refreshReviews({ gh });
  assert.equal(activities.length, 1); // nothing new the third time
});

test('a new request also tells whoever listens for notifications, with what they need to say it', async () => {
  requests = [request('1')];
  await petService.refreshReviews({ gh });
  assert.deepEqual(attentions, [], 'the first fetch is the baseline');
  requests = [
    request('1'),
    request('2', { title: 'Fix it', number: 9, author: 'ana', via: 'a/ui', url: 'https://github.com/a/b/pull/9' }),
  ];
  await petService.refreshReviews({ gh });
  assert.deepEqual(attentions, [
    [
      {
        id: '2',
        kind: 'reviewRequested',
        title: 'Fix it',
        repo: 'a/b',
        number: 9,
        url: 'https://github.com/a/b/pull/9',
        author: 'ana',
        via: 'a/ui',
      },
    ],
  ]);
  await petService.refreshReviews({ gh });
  assert.equal(attentions.length, 1, 'once');
});

test('announce() turns the moments of the user PRs into attention items', async () => {
  const moment = (kind, id) => ({ kind, pr: request(id, { title: `PR ${id}` }) });
  petService.announce([moment('checksFailed', '7'), moment('approved', '8')]);
  assert.deepEqual(
    attentions[0].map((item) => [item.kind, item.id, item.title, item.repo]),
    [
      ['checksFailed', '7', 'PR 7', 'a/b'],
      ['approved', '8', 'PR 8', 'a/b'],
    ],
  );
  petService.announce([]);
  assert.equal(attentions.length, 1, 'nothing to say, nothing emitted');
});

test('a request in a repo that is not selected is not news', async () => {
  await petService.refreshReviews({ gh });
  requests = [request('1'), request('2', { repo: 'x/y' })];
  await petService.refreshReviews({ gh });
  assert.deepEqual(activities, []);
});

test('a failed fetch keeps the last queue and does not throw', async () => {
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
  assert.deepEqual(queueIds(), ['1']);
});

test('with maxAgeMs a recent queue is not fetched again, and the client is only built when needed', async () => {
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

test('when the teams cannot be read the queue still loads, and the teams are tried again next time', async () => {
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
  assert.deepEqual(queueIds(), ['1']);
});

test('a sync fetches the queue along with the rest', async () => {
  await petService.sync();
  assert.deepEqual(queueIds(), ['1']);
});

test('changing the repos starts a new baseline: requests that were already waiting are not news', async () => {
  await petService.refreshReviews({ gh });
  requests = [request('1'), request('2')]; // '2' was already waiting when the repos change
  await petService.configure({ repos: ['a/b', 'a/c'], species: 'phoenix', name: 'Pixel' });
  await petService.sync();
  assert.deepEqual(queueIds(), ['1', '2']);
  assert.deepEqual(activities, []);
});
