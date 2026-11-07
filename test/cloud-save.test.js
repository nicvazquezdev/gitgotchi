const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toSave, isSave, mergeSave, saveSummary } = require('../src/main/cloud/save');

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

test('toSave keeps the pet, repos and history, not device settings', () => {
  const save = toSave(state());
  assert.ok(isSave(save));
  assert.deepEqual(save.profile.repos, ['me/app']);
  assert.equal(save.position, undefined);
  assert.equal(save.petSize, undefined);
  assert.equal(save.activity.lastSyncedAt, undefined);
});

test('restoring into a fresh computer takes the remote pet and history', () => {
  const remote = toSave(state());
  const merged = mergeSave({ pet: null, repos: [], profileUpdatedAt: null, activity: { days: {} } }, remote);
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
  const merged = mergeSave(state({ pet: { ...pet, stageIndex: 2 } }), remote);
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
