// Upgrades a saved state.json to the current schema (pure, no I/O).
const { fromSinglePet } = require('./game/collection');

const SCHEMA = 5;

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

/**
 * v3 → v4: XP only from PRs and reviews. The day ledger keeps its reviews (GitHub only returns the latest 300
 * events, so they cannot be fetched again); everything else is dropped. PRs are backfilled from GraphQL on the
 * next sync (`prsSyncedAt: null`). The stored stage stays as the floor; the level floor is recorded on that sync.
 */
function toV4(state) {
  const days = Object.fromEntries(
    Object.entries(state.activity?.days ?? {})
      .filter(([, d]) => d.reviews > 0)
      .map(([day, d]) => [day, { prs: 0, prsXp: 0, reviews: d.reviews, merges: 0 }]),
  );
  return { ...state, activity: { days, prs: [], lastSyncedAt: null, prsSyncedAt: null } };
}

/**
 * v4 → v5: a collection of pets instead of one. The pet becomes the one pet of the collection, active, keyed by its
 * species and with the XP it has earned: what its days since birth gave, which is what its XP was until now.
 * Its achievements become the person's.
 */
function toV5({ pet, ...state }) {
  return { ...state, ...fromSinglePet(pet, state.activity?.days) };
}

const STEPS = [
  [2, toV2],
  [3, toV3],
  [4, toV4],
  [5, toV5],
];

/** @returns the state upgraded to SCHEMA (unknown fields are kept). */
function migrate(raw) {
  const version = raw.schema ?? 1;
  const state = STEPS.filter(([to]) => version < to).reduce((s, [, step]) => step(s), raw);
  return { ...state, schema: SCHEMA };
}

module.exports = { SCHEMA, migrate };
