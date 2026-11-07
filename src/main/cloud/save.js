// Cloud save format and merge rules (pure, no I/O).
// The save lives in a private repo in the user's own GitHub account: <login>/gitgotchi-save/save.json.
const crypto = require('node:crypto');
const { mergeDays, computeStatus } = require('../game/engine');

const SAVE = {
  repo: 'gitgotchi-save',
  path: 'save.json',
  app: 'gitgotchi',
  schema: 2, // 1 kept the names of the repos; 2 keeps `repoIds` (see repoId). Both are read.
  description: 'Gitgotchi pet save (managed by the Gitgotchi app, safe to delete).',
  // Commits are signed with an address not linked to any account, so they don't count as contributions.
  identity: { name: 'Gitgotchi', email: 'gitgotchi@users.noreply.github.com' },
};

/**
 * What stands for a repo in the save, in place of its name: the names of a company's private repos should not sit
 * readable in a repo of the user's own account. It is the start of a hash of the account and the name, so another
 * computer can find the repos again by hashing the ones it can see (cloud-sync.js). It is not encryption: whoever can
 * guess a name can check it, it only stops the names from being read at a glance.
 */
function repoId(login, fullName) {
  return crypto
    .createHash('sha256')
    .update(`${login.toLowerCase()}:${fullName.toLowerCase()}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * What travels between computers: the pet, which repos were selected (as ids, never names), and the XP history: counts
 * per day and kind. No PR titles, no code. Device settings (window position, pet size, open at login, sync on/off)
 * stay local.
 */
function toSave(state) {
  const login = state.user?.login ?? '';
  return {
    app: SAVE.app,
    schema: SAVE.schema,
    profile: {
      pet: state.pet,
      repoIds: (state.repos ?? []).map((repo) => repoId(login, repo)),
      updatedAt: state.profileUpdatedAt ?? null,
    },
    activity: { days: state.activity.days },
  };
}

const isSave = (json) => json?.app === SAVE.app && json.profile && json.activity;

const samePet = (a, b) => Boolean(a && b && a.species === b.species && a.bornAt === b.bornAt);

/** Union of two sets of reached achievements (id -> day), keeping the earliest day. Undefined when neither has any. */
function mergeAchievements(a, b) {
  if (!a && !b) return undefined;
  const merged = { ...a };
  for (const [id, day] of Object.entries(b ?? {})) if (!merged[id] || day < merged[id]) merged[id] = day;
  return merged;
}

/** Does the remote profile (pet and repos) win over the local one? When it does, its repos are needed by name. */
const remoteWins = (state, save) => (save.profile.updatedAt ?? '') > (state.profileUpdatedAt ?? '') || !state.pet;

/**
 * Merges a remote save into the local state. Returns a store patch.
 * - XP history: max per day and kind on both sides, so nothing is lost or counted twice.
 * - Pet and repos: the most recently changed profile wins (last-write-wins on `updatedAt`).
 * - Same pet on both sides: keep the highest stage either computer reached, and the achievements of both.
 * `remoteRepos`: the names the remote `repoIds` stand for (cloud-sync.js finds them); a save from before schema 2
 * has the names itself.
 */
function mergeSave(state, save, remoteRepos) {
  const remote = save.profile;
  const remoteWon = remoteWins(state, save);
  const winner = remoteWon
    ? { pet: remote.pet, repos: remoteRepos ?? remote.repos }
    : { pet: state.pet, repos: state.repos };
  const other = remoteWon ? state.pet : remote.pet;

  let pet = winner.pet;
  if (samePet(pet, other)) {
    const achievements = mergeAchievements(pet.achievements, other.achievements);
    pet = {
      ...pet,
      stageIndex: Math.max(pet.stageIndex ?? 0, other.stageIndex ?? 0),
      ...(achievements && { achievements }),
    };
  }

  return {
    pet,
    // A winning remote profile whose repos could not be found keeps the local ones rather than leaving none.
    repos: winner.repos ?? (remoteWon && remote.repoIds ? state.repos : []),
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

module.exports = { SAVE, repoId, toSave, isSave, remoteWins, mergeSave, saveSummary };
