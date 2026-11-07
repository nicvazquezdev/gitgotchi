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
  assert.equal(state.pet.species, 'fenix');
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

test('current schema is left untouched', () => {
  const current = { schema: SCHEMA, pet: { species: 'koi', stageIndex: 2 }, petSize: 300 };
  assert.deepEqual(migrate(current), current);
});
