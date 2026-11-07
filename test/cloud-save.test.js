const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { repoId, toSave, isSave, remoteWins, mergeSave, saveSummary } = require('../src/main/cloud/save');

const pet = { species: 'phoenix', name: 'Cindle', bornAt: '2026-11-01T00:00:00Z', stageIndex: 0 };
const state = (over = {}) => ({
  pet,
  repos: ['me/app'],
  profileUpdatedAt: '2026-11-02T00:00:00Z',
  activity: { days: { '2026-11-03': { reviews: 2 } }, lastSyncedAt: 'local' },
  position: { x: 1, y: 2 },
  petSize: 300,
  ...over,
});

test('toSave keeps the pet, which repos and the history, not device settings', () => {
  const save = toSave(state({ user: { login: 'me' } }));
  assert.ok(isSave(save));
  assert.deepEqual(save.profile.repoIds, [repoId('me', 'me/app')]);
  assert.equal(save.position, undefined);
  assert.equal(save.petSize, undefined);
  assert.equal(save.activity.lastSyncedAt, undefined);
});

test('restoring into a fresh computer takes the remote pet and history', () => {
  const remote = toSave(state());
  const merged = mergeSave({ pet: null, repos: [], profileUpdatedAt: null, activity: { days: {} } }, remote, [
    'me/app',
  ]);
  assert.deepEqual(merged.pet, pet);
  assert.deepEqual(merged.repos, ['me/app']);
  assert.equal(merged.activity.days['2026-11-03'].reviews, 2);
});

test('history merges with the max per day and kind', () => {
  const remote = toSave(state({ activity: { days: { '2026-11-03': { reviews: 5 }, '2026-11-04': { merges: 1 } } } }));
  const merged = mergeSave(state(), remote);
  assert.equal(merged.activity.days['2026-11-03'].reviews, 5);
  assert.equal(merged.activity.days['2026-11-04'].merges, 1);
  assert.equal(merged.activity.lastSyncedAt, 'local');
});

test('the most recently changed profile wins, keeping the highest stage of the same pet', () => {
  const remote = toSave(
    state({
      pet: { ...pet, name: 'Ember', stageIndex: 1 },
      repos: ['me/app', 'me/api'],
      profileUpdatedAt: '2026-11-05T00:00:00Z',
    }),
  );
  const merged = mergeSave(state({ pet: { ...pet, stageIndex: 2 } }), remote, ['me/app', 'me/api']);
  assert.equal(merged.pet.name, 'Ember');
  assert.equal(merged.pet.stageIndex, 2);
  assert.deepEqual(merged.repos, ['me/app', 'me/api']);
  assert.equal(merged.profileUpdatedAt, '2026-11-05T00:00:00Z');
});

test('a newer local pet is kept over an older remote one', () => {
  const remote = toSave(state({ profileUpdatedAt: '2026-11-01T00:00:00Z' }));
  const local = state({
    pet: { ...pet, species: 'koi', bornAt: '2026-11-06T00:00:00Z' },
    profileUpdatedAt: '2026-11-06T00:00:00Z',
  });
  assert.equal(mergeSave(local, remote).pet.species, 'koi');
});

test('saveSummary describes the saved pet', () => {
  const summary = saveSummary(toSave(state()));
  assert.equal(summary.name, 'Cindle');
  assert.equal(summary.speciesId, 'phoenix');
  assert.ok(summary.level >= 1);
  assert.equal(isSave({ app: 'other' }), false);
});

test('achievements travel with the pet, and the same pet on two computers keeps both sets (earliest day)', () => {
  const local = state({ pet: { ...pet, achievements: { 'first-pr': '2026-11-03', 'review-10': '2026-11-05' } } });
  const remote = toSave(
    state({
      pet: { ...pet, achievements: { 'first-pr': '2026-11-02', 'first-merge': '2026-11-04' } },
      profileUpdatedAt: '2026-11-04T00:00:00Z',
    }),
  );
  assert.deepEqual(remote.profile.pet.achievements, { 'first-pr': '2026-11-02', 'first-merge': '2026-11-04' });
  const merged = mergeSave(local, remote);
  assert.deepEqual(merged.pet.achievements, {
    'first-pr': '2026-11-02',
    'first-merge': '2026-11-04',
    'review-10': '2026-11-05',
  });
});

test('a pet without achievements on both sides stays without them (the first check records silently)', () => {
  const merged = mergeSave(state(), toSave(state({ profileUpdatedAt: '2026-11-04T00:00:00Z' })));
  assert.equal('achievements' in merged.pet, false);
});

test('another pet does not inherit the achievements of the one that lost the merge', () => {
  const remote = toSave(
    state({
      pet: { ...pet, species: 'koi', bornAt: '2026-11-06T00:00:00Z', achievements: { 'first-pr': '2026-11-07' } },
      profileUpdatedAt: '2026-11-06T00:00:00Z',
    }),
  );
  const merged = mergeSave(state({ pet: { ...pet, achievements: { 'first-merge': '2026-11-03' } } }), remote);
  assert.deepEqual(merged.pet.achievements, { 'first-pr': '2026-11-07' });
});

test('the save never contains the name of a repo, only ids', () => {
  const save = toSave(state({ user: { login: 'me' }, repos: ['acme/secret-project', 'acme/web-app'] }));
  const text = JSON.stringify(save);
  assert.ok(!text.includes('secret-project') && !text.includes('web-app') && !text.includes('acme'));
  assert.equal(save.profile.repos, undefined);
  assert.equal(save.profile.repoIds.length, 2);
  assert.ok(save.profile.repoIds.every((id) => /^[0-9a-f]{16}$/.test(id)));
  assert.equal(save.schema, 2);
});

describe('repoId', () => {
  test('is the same for the same account and repo, however it is written', () => {
    assert.equal(repoId('Me', 'Acme/Web-App'), repoId('me', 'acme/web-app'));
  });

  test('differs between repos and between accounts', () => {
    assert.notEqual(repoId('me', 'acme/web-app'), repoId('me', 'acme/api'));
    assert.notEqual(repoId('me', 'acme/web-app'), repoId('you', 'acme/web-app'));
  });
});

describe('a save from before the ids (schema 1, with the names)', () => {
  const legacy = () => ({
    app: 'gitgotchi',
    schema: 1,
    profile: { pet, repos: ['me/app', 'me/api'], updatedAt: '2026-11-05T00:00:00Z' },
    activity: { days: { '2026-11-03': { reviews: 2 } } },
  });
  const fresh = { pet: null, repos: [], profileUpdatedAt: null, activity: { days: {} } };

  test('is still read: its names are used when no ids were resolved', () => {
    assert.ok(isSave(legacy()));
    assert.deepEqual(mergeSave(fresh, legacy()).repos, ['me/app', 'me/api']);
  });

  test('and the next save is written with ids, so the names leave the file', () => {
    const merged = mergeSave(fresh, legacy());
    const next = toSave({ ...fresh, ...merged, user: { login: 'me' } });
    assert.equal(next.profile.repos, undefined);
    assert.deepEqual(next.profile.repoIds, [repoId('me', 'me/app'), repoId('me', 'me/api')]);
  });
});

describe('remoteWins and the repos', () => {
  const remote = (updatedAt) => toSave(state({ profileUpdatedAt: updatedAt }));

  test('the remote profile wins when it is newer or when there is no local pet', () => {
    assert.equal(remoteWins(state({ profileUpdatedAt: '2026-11-01T00:00:00Z' }), remote('2026-11-05T00:00:00Z')), true);
    assert.equal(remoteWins(state({ pet: null }), remote('2026-10-01T00:00:00Z')), true);
    assert.equal(
      remoteWins(state({ profileUpdatedAt: '2026-11-09T00:00:00Z' }), remote('2026-11-05T00:00:00Z')),
      false,
    );
  });

  test('a winning remote profile whose repos could not be found keeps the local repos', () => {
    const merged = mergeSave(state({ profileUpdatedAt: '2026-11-01T00:00:00Z' }), remote('2026-11-05T00:00:00Z'));
    assert.deepEqual(merged.repos, ['me/app']);
  });

  test('when no repo could be matched the remote profile still wins, with none (the user picks again)', () => {
    const merged = mergeSave(state({ profileUpdatedAt: '2026-11-01T00:00:00Z' }), remote('2026-11-05T00:00:00Z'), []);
    assert.deepEqual(merged.repos, []);
  });
});
