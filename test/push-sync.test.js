const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { PUSH_LOOKUPS_PER_SYNC } = require('../src/main/game/catalog');
const { emptyActivity } = require('../src/main/game/engine');

// The sync talks to the store and to GitHub: replace both to see how pushes turn into commits.
const src = (file) => path.join(__dirname, '../src/main', file);
const fake = (file, exports) => {
  require.cache[src(file)] = { id: src(file), filename: src(file), loaded: true, exports };
};

let state;
let gh;
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', { isConnected: () => true, client: async () => gh });
const petService = require('../src/main/services/pet-service');

const today = new Date().toISOString();
const pushEvent = (id, repo = 'a/b') => ({
  kind: 'pushes',
  id: String(id),
  repo,
  day: today.slice(0, 10),
  before: 'x',
  head: 'y',
});
const commit = (n) => ({ authorDate: `2026-06-15T10:00:0${n}Z`, message: `Commit ${n}` });

beforeEach(() => {
  state = {
    user: { login: 'me' },
    repos: ['a/b'],
    pet: { species: 'phoenix', name: 'Pixel', bornAt: '2026-01-01T00:00:00Z', stageIndex: null },
    activity: emptyActivity(),
  };
  gh = {
    activity: async () => [],
    pullRequestsSince: async () => [],
    pushCommits: async () => [],
  };
});

test('a push is worth its commits, and is looked up only once', async () => {
  let lookups = 0;
  gh.activity = async () => [pushEvent(1)];
  gh.pushCommits = async () => (lookups++, [commit(1), commit(2)]);
  await petService.sync();
  await petService.sync();
  assert.equal(lookups, 1);
  assert.equal(state.activity.days[today.slice(0, 10)].commits, 2);
  assert.deepEqual(
    state.activity.pushes.map((p) => p.id),
    ['1'],
  );
});

test('pushes in repos that are not selected are never looked up', async () => {
  const seen = [];
  gh.activity = async () => [pushEvent(1, 'other/repo'), pushEvent(2)];
  gh.pushCommits = async (repo) => (seen.push(repo), []);
  await petService.sync();
  assert.deepEqual(seen, ['a/b']);
});

test('a failed lookup leaves the push unresolved and tries again on the next sync', async () => {
  let fail = true;
  gh.activity = async () => [pushEvent(1)];
  gh.pushCommits = async () => {
    if (fail) throw new Error('rate limited');
    return [commit(1)];
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await petService.sync();
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(state.activity.pushes, []);
  assert.equal(state.activity.days[today.slice(0, 10)], undefined);
  fail = false;
  await petService.sync();
  assert.equal(state.activity.days[today.slice(0, 10)].commits, 1);
});

test('one sync looks up at most PUSH_LOOKUPS_PER_SYNC pushes; the rest follow on the next', async () => {
  const total = PUSH_LOOKUPS_PER_SYNC + 5;
  gh.activity = async () => Array.from({ length: total }, (_, i) => pushEvent(i + 1));
  let lookups = 0;
  gh.pushCommits = async () => (lookups++, []);
  await petService.sync();
  assert.equal(lookups, PUSH_LOOKUPS_PER_SYNC);
  await petService.sync();
  assert.equal(lookups, total);
});

test('a rebased push does not count the same commits again', async () => {
  gh.activity = async () => [pushEvent(1), pushEvent(2)];
  gh.pushCommits = async () => [commit(1), commit(2)]; // same author date and subject, new shas
  await petService.sync();
  assert.equal(state.activity.days[today.slice(0, 10)].commits, 2);
});
