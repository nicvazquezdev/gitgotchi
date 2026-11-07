const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate, SCHEMA } = require('../src/main/migrations');

const v1 = {
  user: { login: 'octo' },
  pet: { species: 'dragon', name: 'Mergon', bornAt: '2026-11-07T00:00:00Z', stageIndex: 1 },
  petSize: 128,
  position: { x: 10, y: 20 },
};

test('v1 maps placeholder species, shifts stages down and drops the old size', () => {
  const state = migrate(v1);
  assert.equal(state.schema, SCHEMA);
  assert.equal(state.pet.species, 'phoenix');
  assert.equal(state.pet.stageIndex, 0);
  assert.equal(state.petSize, undefined);
  assert.deepEqual(state.position, v1.position);
  assert.equal(state.pet.name, 'Mergon');
});

test('v1 without a pet or with an unset stage', () => {
  assert.equal(migrate({ user: null, pet: null }).pet, undefined);
  assert.equal(migrate({ pet: { ...v1.pet, stageIndex: null } }).pet.stageIndex, null);
  assert.equal(migrate({ pet: { ...v1.pet, stageIndex: 0 } }).pet.stageIndex, 0);
});

test('v2 renames the sprite lines', () => {
  const state = migrate({ schema: 2, pet: { species: 'hongo', stageIndex: 1 }, petSize: 208 });
  assert.equal(state.pet.species, 'mushroom');
  assert.equal(state.pet.stageIndex, 1);
  assert.equal(state.petSize, 208);
});

test('v3 keeps reviews, drops other kinds and queues a PR backfill; stage floor is kept', () => {
  const state = migrate({
    schema: 3,
    pet: { species: 'koi', stageIndex: 2 },
    repos: ['a/b'],
    activity: {
      days: {
        '2026-06-01': { pushes: 5, prs: 2, merges: 1, reviews: 3, comments: 4, issues: 1 },
        '2026-06-02': { pushes: 9, prs: 1, merges: 0, reviews: 0, comments: 0, issues: 0 },
      },
      lastSyncedAt: '2026-06-02T10:00:00Z',
    },
  });
  assert.equal(state.schema, SCHEMA);
  assert.deepEqual(state.activity, {
    days: { '2026-06-01': { prs: 0, prsXp: 0, reviews: 3, merges: 0 } },
    prs: [],
    lastSyncedAt: null,
    prsSyncedAt: null,
  });
  assert.equal(state.pet.stageIndex, 2);
  assert.deepEqual(state.repos, ['a/b']);
});

test('v3 without activity gets an empty ledger', () => {
  const state = migrate({ schema: 3, pet: null });
  assert.deepEqual(state.activity, { days: {}, prs: [], lastSyncedAt: null, prsSyncedAt: null });
});

test('current schema is left untouched', () => {
  const current = { schema: SCHEMA, pet: { species: 'koi', stageIndex: 2 }, petSize: 300 };
  assert.deepEqual(migrate(current), current);
});
