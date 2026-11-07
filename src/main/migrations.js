// Upgrades a saved state.json to the current schema (pure, no I/O).
const SCHEMA = 3;

// v1 placeholder species → closest v2 sprite line.
const V1_SPECIES = { blob: 'hongo', cat: 'carnero', dragon: 'fenix', bot: 'geoda' };

/** v1 → v2: real sprites. No egg stage anymore (indices shift down) and `petSize` now measures the sprite box. */
function toV2({ pet, petSize, ...rest }) {
  if (!pet) return rest;
  const stageIndex = pet.stageIndex == null ? null : Math.max(0, pet.stageIndex - 1);
  return { ...rest, pet: { ...pet, species: V1_SPECIES[pet.species] ?? pet.species, stageIndex } };
}

// v2 sprite line ids (Spanish) → v3 ids (sprite set 2, English).
const V2_SPECIES = {
  fenix: 'phoenix',
  carnero: 'ram',
  polilla: 'moth',
  medusa: 'jelly',
  geoda: 'geode',
  hongo: 'mushroom',
  celeste: 'stag',
  koi: 'koi',
};

/** v2 → v3: sprite set 2 renamed the creature lines. */
function toV3(state) {
  if (!state.pet) return state;
  return { ...state, pet: { ...state.pet, species: V2_SPECIES[state.pet.species] ?? state.pet.species } };
}

const STEPS = [
  [2, toV2],
  [3, toV3],
];

/** @returns the state upgraded to SCHEMA (unknown fields are kept). */
function migrate(raw) {
  const version = raw.schema ?? 1;
  const state = STEPS.filter(([to]) => version < to).reduce((s, [, step]) => step(s), raw);
  return { ...state, schema: SCHEMA };
}

module.exports = { SCHEMA, migrate };
