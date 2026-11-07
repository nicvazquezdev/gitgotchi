const { test, describe, beforeEach } = require('node:test');
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
  accessibleRepos: async () => [],
};
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', { client: async () => client });
const cloud = require('../src/main/cloud/cloud-sync');

const { toSave } = require('../src/main/cloud/save');
const pet = { species: 'phoenix', name: 'Cindle', bornAt: '2026-11-01T00:00:00Z', stageIndex: 0, earned: {} };
const one = { pets: { phoenix: pet }, activePet: 'phoenix' }; // a collection of one

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
  state = { user: { login: 'me' }, ...one, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
  repo = { exists: false };
  const phases = await phasesOf(() => cloud.enable());
  assert.deepEqual(phases, ['checking', 'creating', 'pulling', 'saving', null]);
  assert.equal(cloud.isBusy(), false);
  assert.ok(cloud.status().lastPushAt);
});

test('an existing repo skips the creating step', async () => {
  state = { user: { login: 'me' }, ...one, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
  repo = { exists: true };
  assert.deepEqual(await phasesOf(() => cloud.enable()), ['checking', 'pulling', 'saving', null]);
});

test('a failing step ends idle with the error, and the switch can be used again', async () => {
  state = { user: { login: 'me' }, ...one, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
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

test('the save is remembered after the backup is turned off, because the repo stays', async () => {
  state = { user: { login: 'me' }, ...one, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
  repo = { exists: false };
  client.writeJsonFile = async () => 'sha';
  assert.equal(cloud.status().saved, false);
  await cloud.enable();
  assert.equal(cloud.status().saved, true);
  cloud.disable();
  assert.deepEqual({ enabled: cloud.status().enabled, saved: cloud.status().saved }, { enabled: false, saved: true });
});

test('finding a save in the account counts as saved', async () => {
  state = { user: { login: 'me' }, ...one, repos: ['me/app'], activity: { days: {} }, cloudSync: false };
  client.readJsonFile = async () => ({ sha: 's', json: toSave(state) });
  await cloud.restore();
  assert.equal(cloud.status().saved, true);
});

describe('restoring the repos from a save that only has their ids', () => {
  const saved = {
    user: { login: 'me' },
    ...one,
    repos: ['acme/web-app', 'acme/api', 'acme/gone'],
    activity: { days: {} },
  };
  const newComputer = () => ({
    user: { login: 'me' },
    pets: {},
    activePet: null,
    repos: [],
    activity: { days: {} },
    cloudSync: false,
  });
  let listed;
  beforeEach(() => {
    listed = 0;
    client.accessibleRepos = async () => (
      listed++,
      [{ fullName: 'acme/web-app' }, { fullName: 'Acme/API' }, { fullName: 'acme/unrelated' }]
    );
  });

  test('the names are found among the repos the user can see, and the ones they cannot see any more are left out', async () => {
    state = newComputer();
    client.readJsonFile = async () => ({ sha: 's', json: toSave(saved) });
    await cloud.restore();
    assert.deepEqual(state.repos, ['acme/web-app', 'Acme/API']);
    assert.deepEqual([state.pets, state.activePet], [{ phoenix: pet }, 'phoenix']);
  });

  test('the file in the repo has no repo names', async () => {
    let written;
    state = { ...saved, cloudSync: false };
    repo = { exists: true };
    client.readJsonFile = async () => null;
    client.writeJsonFile = async (owner, name, filePath, { json }) => ((written = JSON.stringify(json)), 'sha');
    await cloud.enable();
    assert.ok(written);
    assert.ok(!written.includes('acme') && !written.includes('web-app'));
  });

  test('a save from before the ids has the names itself: no need to list the repos', async () => {
    state = newComputer();
    const legacy = toSave(saved);
    delete legacy.profile.repoIds;
    legacy.profile.repos = ['acme/web-app', 'acme/api'];
    client.readJsonFile = async () => ({ sha: 's', json: legacy });
    await cloud.restore();
    assert.deepEqual(state.repos, ['acme/web-app', 'acme/api']);
    assert.equal(listed, 0);
  });

  test('when this computer has the newer profile, the repos are not listed at all', async () => {
    state = { ...saved, cloudSync: true, profileUpdatedAt: '2099-01-01T00:00:00Z' };
    client.readJsonFile = async () => ({
      sha: 's',
      json: toSave({ ...saved, profileUpdatedAt: '2026-01-01T00:00:00Z' }),
    });
    await cloud.pull();
    assert.equal(listed, 0);
    assert.deepEqual(state.repos, saved.repos);
  });

  test('if GitHub cannot list the repos, the restore fails with a visible error and nothing is changed', async () => {
    state = newComputer();
    client.accessibleRepos = async () => {
      throw new Error('GitHub 502');
    };
    client.readJsonFile = async () => ({ sha: 's', json: toSave(saved) });
    const originalError = console.error;
    console.error = () => {};
    try {
      await cloud.restore();
    } finally {
      console.error = originalError;
    }
    assert.equal(cloud.status().error, 'GitHub 502');
    assert.deepEqual(state.pets, {});
  });
});

test('the repo name is "<login>/gitgotchi-save"', () => {
  assert.equal(cloud.status().repo, 'me/gitgotchi-save');
});
