// Upgrades a saved state.json to the current schema (pure, no I/O).
const SCHEMA = 2;

// v1 placeholder species → closest v2 sprite line.
const V1_SPECIES = { blob: 'hongo', cat: 'carnero', dragon: 'fenix', bot: 'geoda' };

/** v1 → v2: real sprites. No egg stage anymore (indices shift down) and `petSize` now measures the sprite box. */
function toV2({ pet, petSize, ...rest }) {
  if (!pet) return rest;
  const stageIndex = pet.stageIndex == null ? null : Math.max(0, pet.stageIndex - 1);
  return { ...rest, pet: { ...pet, species: V1_SPECIES[pet.species] ?? pet.species, stageIndex } };
}

/** @returns the state upgraded to SCHEMA (unknown fields are kept). */
function migrate(raw) {
  const version = raw.schema ?? 1;
  const state = version < 2 ? toV2(raw) : raw;
  return { ...state, schema: SCHEMA };
}

module.exports = { SCHEMA, migrate };
