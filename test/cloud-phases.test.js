const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// CloudSync talks to the store and to GitHub: replace both so the job sequence can be observed.
const src = (file) => path.join(__dirname, '../src/main', file);
const fake = (file, exports) => {
  require.cache[src(file)] = { id: src(file), filename: src(file), loaded: true, exports };
};

let state;
let repo;
const client = {
  repoExists: async () => repo.exists,
  createPrivateRepo: async () => (repo.exists = true),
  readJsonFile: async () => null,
  writeJsonFile: async () => 'sha',
};
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', { client: async () => client });
const cloud = require('../src/main/cloud/cloud-sync');

const pet = { species: 'phoenix', name: 'Cindle', bornAt: '2026-11-01T00:00:00Z', stageIndex: 0 };

/** Runs `job` and returns the phases the status reported, in order, ending with the idle state. */
async function phasesOf(job) {
  const seen = [];
  const listener = (status) => seen.push(status.phase);
  cloud.on('status', listener);
  await job();
  cloud.off('status', listener);
  return seen;
}

test('turning the backup on reports each step, creating the repo when it is missing', async () => {
  state = { user: { login: 'me' }, pet, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
  repo = { exists: false };
  const phases = await phasesOf(() => cloud.enable());
  assert.deepEqual(phases, ['checking', 'creating', 'pulling', 'saving', null]);
  assert.equal(cloud.isBusy(), false);
  assert.ok(cloud.status().lastPushAt);
});

test('an existing repo skips the creating step', async () => {
  state = { user: { login: 'me' }, pet, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
  repo = { exists: true };
  assert.deepEqual(await phasesOf(() => cloud.enable()), ['checking', 'pulling', 'saving', null]);
});

test('a failing step ends idle with the error, and the switch can be used again', async () => {
  state = { user: { login: 'me' }, pet, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
  repo = { exists: true };
  client.writeJsonFile = async () => {
    throw new Error('boom');
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await cloud.enable();
  } finally {
    console.error = originalError;
  }
  assert.equal(cloud.status().phase, null);
  assert.equal(cloud.status().error, 'boom');
  assert.equal(cloud.isBusy(), false);
});

test('the repo name is "<login>/gitgotchi-save"', () => {
  assert.equal(cloud.status().repo, 'me/gitgotchi-save');
});
