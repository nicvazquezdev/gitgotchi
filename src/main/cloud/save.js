// Cloud save format and merge rules (pure, no I/O).
// The save lives in a private repo in the user's own GitHub account: <login>/gitgotchi-save/save.json.
const crypto = require('node:crypto');
const { mergeDays, computeStatus } = require('../game/engine');
const { fromSinglePet } = require('../game/collection');
const { mergeTimeOff } = require('../game/time-off');

const SAVE = {
  repo: 'gitgotchi-save',
  path: 'save.json',
  app: 'gitgotchi',
  schema: 3, // 1 kept the names of the repos; 2 keeps `repoIds` (see repoId); 3 keeps the collection (`pets`). All are read.
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
 * What travels between computers: the pets (with the XP each earned per day), which one is active, the achievements,
 * the days of time off, which repos were selected (as ids, never names), and the XP history: counts per day and kind.
 * No PR titles, no code. Device settings (window position, pet size, open at login, sync on/off) stay local.
 */
function toSave(state) {
  const login = state.user?.login ?? '';
  return {
    app: SAVE.app,
    schema: SAVE.schema,
    profile: {
      pets: state.pets,
      activePet: state.activePet,
      achievements: state.achievements,
      timeOff: state.timeOff ?? [],
      repoIds: (state.repos ?? []).map((repo) => repoId(login, repo)),
      updatedAt: state.profileUpdatedAt ?? null,
    },
    activity: { days: state.activity.days },
  };
}

const isSave = (json) => json?.app === SAVE.app && json.profile && json.activity;

const hasPets = (pets) => Object.keys(pets ?? {}).length > 0;

/** The save in the current shape: a save from before the collection (one `pet`) becomes a collection of one. */
function upgradeSave(save) {
  if (save.profile.pets) return save;
  const { pet, ...profile } = save.profile;
  return { ...save, profile: { ...profile, ...fromSinglePet(pet, save.activity.days) } };
}

/** Union of two sets of reached achievements (id -> day), keeping the earliest day. Undefined when neither has any. */
function mergeAchievements(a, b) {
  if (!a && !b) return undefined;
  const merged = { ...a };
  for (const [id, day] of Object.entries(b ?? {})) if (!merged[id] || day < merged[id]) merged[id] = day;
  return merged;
}

/** The one that is set, or the better of the two (`pick`) when both are. */
const best = (a, b, pick) => (a == null ? b : b == null ? a : pick(a, b));
const earliest = (a, b) => (a < b ? a : b);

/** XP earned per day on both computers: the max per day, so nothing is lost or counted twice. */
function mergeEarned(a = {}, b = {}) {
  const merged = { ...a };
  for (const [day, xp] of Object.entries(b)) merged[day] = Math.max(merged[day] ?? 0, xp);
  return merged;
}

/**
 * The pets of both computers: a species on one side only is kept as it is (nothing is lost by switching computers),
 * and a species on both keeps the XP, level and stage either reached and the name of the winning profile.
 * `remoteXp`: false for a save from before the collection, whose single pet carries all the XP of the person (it was
 * the only one): that XP must not be added to a pet this computer already tracks, or it would be counted twice.
 */
function mergePets(local, remote, remoteWon, remoteXp = true) {
  const merged = { ...local, ...remote };
  for (const id of Object.keys(remote).filter((species) => local[species])) {
    const [mine, theirs] = [local[id], remote[id]];
    const [winner, loser] = remoteWon ? [theirs, mine] : [mine, theirs];
    const pet = {
      ...loser,
      ...winner,
      bornAt: earliest(mine.bornAt, theirs.bornAt),
      earned: remoteXp ? mergeEarned(mine.earned, theirs.earned) : mine.earned,
      level: best(mine.level, theirs.level, Math.max),
      stageIndex: best(mine.stageIndex, theirs.stageIndex, Math.max),
      matureAt: best(mine.matureAt, theirs.matureAt, earliest),
    };
    merged[id] = Object.fromEntries(Object.entries(pet).filter(([, value]) => value !== undefined));
  }
  return merged;
}

/** Does the remote profile (pets and repos) win over the local one? When it does, its repos are needed by name. */
const remoteWins = (state, save) =>
  (save.profile.updatedAt ?? '') > (state.profileUpdatedAt ?? '') || !hasPets(state.pets);

/**
 * Merges a remote save into the local state. Returns a store patch.
 * - XP history: max per day and kind on both sides, so nothing is lost or counted twice.
 * - Pets: both collections are kept, one per species (see mergePets); the XP each pet earned merges like the history.
 * - Which pet is active, the repos: the most recently changed profile wins (last-write-wins on `updatedAt`).
 * - Achievements: the ones of both computers, with the earliest day.
 * - Time off: the ranges of both computers (see mergeTimeOff).
 * `remoteRepos`: the names the remote `repoIds` stand for (cloud-sync.js finds them); a save from before schema 2
 * has the names itself.
 */
function mergeSave(state, rawSave, remoteRepos) {
  const save = upgradeSave(rawSave);
  const remote = save.profile;
  const remoteWon = remoteWins(state, save);
  const winner = remoteWon
    ? { activePet: remote.activePet, repos: remoteRepos ?? remote.repos }
    : { activePet: state.activePet, repos: state.repos };
  const pets = mergePets(state.pets ?? {}, remote.pets ?? {}, remoteWon, Boolean(rawSave.profile.pets));
  const achievements = mergeAchievements(state.achievements, remote.achievements);

  return {
    pets,
    activePet:
      [winner.activePet, state.activePet, remote.activePet].find((id) => pets[id]) ?? Object.keys(pets)[0] ?? null,
    ...(achievements && { achievements }),
    timeOff: mergeTimeOff(state.timeOff, remote.timeOff),
    // A winning remote profile whose repos could not be found keeps the local ones rather than leaving none.
    repos: winner.repos ?? (remoteWon && remote.repoIds ? state.repos : []),
    profileUpdatedAt: [remote.updatedAt, state.profileUpdatedAt].filter(Boolean).sort().at(-1) ?? null,
    activity: { ...state.activity, days: mergeDays(state.activity.days, save.activity.days ?? {}) },
  };
}

/** Short description for the "restore your pets?" prompt (level computed from the saved history). */
function saveSummary(rawSave) {
  const save = upgradeSave(rawSave);
  const { pets, activePet } = save.profile;
  const pet = pets?.[activePet];
  if (!pet) return null;
  const status = computeStatus({ pets, activePet, activity: { days: save.activity.days ?? {}, lastSyncedAt: null } });
  return {
    name: pet.name,
    speciesId: pet.species,
    stageIndex: status?.stage.index ?? pet.stageIndex ?? 0,
    level: status?.level ?? (status?.stage.index ?? 0) + 1,
    count: Object.keys(pets).length,
  };
}

module.exports = { SAVE, repoId, toSave, isSave, remoteWins, mergeSave, saveSummary };
