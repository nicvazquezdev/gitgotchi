const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migrate, SCHEMA } = require('../src/main/migrations');

const v1 = {
  user: { login: 'octo' },
  pet: { species: 'dragon', name: 'Mergon', bornAt: '2026-11-07T00:00:00Z', stageIndex: 1 },
  petSize: 128,
  position: { x: 10, y: 20 },
};

/** The active pet of a migrated state. */
const active = (state) => state.pets[state.activePet];

test('v1 maps placeholder species, shifts stages down and drops the old size', () => {
  const state = migrate(v1);
  assert.equal(state.schema, SCHEMA);
  assert.equal(state.activePet, 'phoenix');
  assert.equal(active(state).species, 'phoenix');
  assert.equal(active(state).stageIndex, 0);
  assert.equal(state.petSize, undefined);
  assert.deepEqual(state.position, v1.position);
  assert.equal(active(state).name, 'Mergon');
});

test('v1 without a pet or with an unset stage', () => {
  const none = migrate({ user: null, pet: null });
  assert.deepEqual([none.pets, none.activePet], [{}, null]);
  assert.equal(active(migrate({ pet: { ...v1.pet, stageIndex: null } })).stageIndex, null);
  assert.equal(active(migrate({ pet: { ...v1.pet, stageIndex: 0 } })).stageIndex, 0);
});

test('v2 renames the sprite lines', () => {
  const state = migrate({ schema: 2, pet: { species: 'hongo', stageIndex: 1 }, petSize: 208 });
  assert.equal(state.activePet, 'mushroom');
  assert.equal(active(state).species, 'mushroom');
  assert.equal(active(state).stageIndex, 1);
  assert.equal(state.petSize, 208);
});

test('v3 keeps reviews, drops other kinds and queues a PR backfill; stage floor is kept', () => {
  const state = migrate({
    schema: 3,
    pet: { species: 'koi', stageIndex: 2, bornAt: '2026-01-01T00:00:00Z' },
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
  assert.equal(active(state).stageIndex, 2);
  assert.deepEqual(state.repos, ['a/b']);
});

test('v3 without activity gets an empty ledger', () => {
  const state = migrate({ schema: 3, pet: null });
  assert.deepEqual(state.activity, { days: {}, prs: [], lastSyncedAt: null, prsSyncedAt: null });
});

test('v4 turns the pet into a collection of one: active, with the XP of its days since birth', () => {
  const day = (counts) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, commits: 0, issues: 0, ...counts });
  const state = migrate({
    schema: 4,
    pet: {
      species: 'koi',
      name: 'Finn',
      bornAt: new Date(2026, 5, 10, 9).toISOString(),
      stageIndex: 1,
      level: 6,
      achievements: { 'first-pr': '2026-06-11' },
    },
    activity: {
      days: {
        '2026-06-09': day({ reviews: 5 }), // before birth: not the pet's
        '2026-06-10': day({ reviews: 1 }),
        '2026-06-12': day({ merges: 2, prs: 1, prsXp: 20 }),
        '2026-06-13': day(), // a day without XP leaves no entry
      },
      prs: [],
    },
  });
  assert.equal(state.activePet, 'koi');
  assert.equal(state.pet, undefined);
  assert.deepEqual(Object.keys(state.pets), ['koi']);
  assert.deepEqual(active(state).earned, { '2026-06-10': 10, '2026-06-12': 50 });
  assert.deepEqual([active(state).name, active(state).stageIndex, active(state).level], ['Finn', 1, 6]);
  // The achievements are the person's now, not the pet's.
  assert.deepEqual(state.achievements, { 'first-pr': '2026-06-11' });
  assert.equal('achievements' in active(state), false);
});

test('v4 without a pet gets an empty collection, and without achievements stays without them', () => {
  const empty = migrate({ schema: 4, pet: null, activity: { days: {} } });
  assert.deepEqual([empty.pets, empty.activePet, 'achievements' in empty], [{}, null, false]);
  const pet = { species: 'koi', name: 'Finn', bornAt: '2026-06-10T00:00:00Z', stageIndex: 0 };
  assert.equal('achievements' in migrate({ schema: 4, pet, activity: { days: {} } }), false);
});

test('current schema is left untouched', () => {
  const current = { schema: SCHEMA, pets: { koi: { species: 'koi', stageIndex: 2 } }, activePet: 'koi', petSize: 300 };
  assert.deepEqual(migrate(current), current);
});
