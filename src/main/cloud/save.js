// Cloud save format and merge rules (pure, no I/O).
// The save lives in a private repo in the user's own GitHub account: <login>/gitgotchi-save/save.json.
const { mergeDays, computeStatus } = require('../game/engine');

const SAVE = {
  repo: 'gitgotchi-save',
  path: 'save.json',
  app: 'gitgotchi',
  schema: 1,
  description: 'Gitgotchi pet save (managed by the Gitgotchi app, safe to delete).',
  // Commits are signed with an address not linked to any account, so they don't count as contributions.
  identity: { name: 'Gitgotchi', email: 'gitgotchi@users.noreply.github.com' },
};

/**
 * What travels between computers: the pet, the selected repos and the XP history.
 * Device settings (window position, pet size, open at login, sync on/off) stay local.
 */
function toSave(state) {
  return {
    app: SAVE.app,
    schema: SAVE.schema,
    profile: { pet: state.pet, repos: state.repos, updatedAt: state.profileUpdatedAt ?? null },
    activity: { days: state.activity.days },
  };
}

const isSave = (json) => json?.app === SAVE.app && json.profile && json.activity;

const samePet = (a, b) => Boolean(a && b && a.species === b.species && a.bornAt === b.bornAt);

/**
 * Merges a remote save into the local state. Returns a store patch.
 * - XP history: max per day and kind on both sides, so nothing is lost or counted twice.
 * - Pet and repos: the most recently changed profile wins (last-write-wins on `updatedAt`).
 * - Same pet on both sides: keep the highest stage either computer reached.
 */
function mergeSave(state, save) {
  const remote = save.profile;
  const remoteNewer = (remote.updatedAt ?? '') > (state.profileUpdatedAt ?? '');
  const winner = remoteNewer || !state.pet ? remote : { pet: state.pet, repos: state.repos };
  const other = winner === remote ? state.pet : remote.pet;

  let pet = winner.pet;
  if (samePet(pet, other)) pet = { ...pet, stageIndex: Math.max(pet.stageIndex ?? 0, other.stageIndex ?? 0) };

  return {
    pet,
    repos: winner.repos ?? [],
    profileUpdatedAt: [remote.updatedAt, state.profileUpdatedAt].filter(Boolean).sort().at(-1) ?? null,
    activity: { ...state.activity, days: mergeDays(state.activity.days, save.activity.days ?? {}) },
  };
}

/** Short description for the "restore your pet?" prompt (level computed from the saved history). */
function saveSummary(save) {
  const { pet } = save.profile;
  if (!pet) return null;
  const status = computeStatus({ pet, activity: { days: save.activity.days ?? {}, lastSyncedAt: null } });
  return {
    name: pet.name,
    speciesId: pet.species,
    stageIndex: status?.stage.index ?? pet.stageIndex ?? 0,
    level: status?.level ?? (status?.stage.index ?? 0) + 1,
  };
}

module.exports = { SAVE, toSave, isSave, mergeSave, saveSummary };
