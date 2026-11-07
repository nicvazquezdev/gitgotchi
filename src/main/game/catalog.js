// Game data: species, evolution stages and scoring rules.
// The UI receives this catalog over IPC, so there is a single source of truth.

// Sprite metadata (files, native sizes, shadow ellipses, creature names per stage) comes from
// assets/pets/sprites.json, exported by the sprite tool. The English copy for each line lives here.
const SPRITES = require('../../../assets/pets/sprites.json');

// Per line: its element type and a one-line personality (from the app design).
const SPECIES_COPY = {
  phoenix: { type: 'Fire', desc: 'Stubborn and warm. Lights up with every merge.' },
  ram: { type: 'Storm', desc: 'Calm until it thunders. Loves a clean deploy.' },
  moth: { type: 'Moonlight', desc: 'A night owl drawn to the glow of your monitor.' },
  jelly: { type: 'Aurora', desc: 'Drifts along patiently. Great at waiting for reviews.' },
  geode: { type: 'Crystal', desc: 'Steady and solid. Nothing rushes it.' },
  mushroom: { type: 'Forest', desc: 'Cozy and curious. Grows best in quiet corners.' },
  stag: { type: 'Cosmic', desc: 'A dreamer who sees your commits as constellations.' },
  koi: { type: 'Water', desc: 'Swims against the current. Destined to climb.' },
};

// A faint shadow means the creature hovers (jelly, koi, flying moth and phoenix).
const FLOAT_SHADOW_ALPHA = 0.6;

const SPECIES = SPRITES.map(({ id, title, bg, stages }) => ({
  id,
  line: title, // e.g. 'Phoenix line'
  ...SPECIES_COPY[id],
  tint: bg, // panel background behind the creature
  stages: stages.map(({ name, file, shadow, size, shadowEllipse }, i) => ({
    name, // creature name at this stage, e.g. Cindle → Kindlet → Pyrrow → Solphyre
    file,
    shadow,
    silhouette: `${id}_${i + 1}_sil.png`, // locked stages are shown as this, at ~20% opacity
    size, // native px (square canvas)
    shadowEllipse, // native px; sprites are aligned on its center so every stage stands on the same floor
    floats: shadowEllipse.alpha <= FLOAT_SHADOW_ALPHA,
  })),
}));

// ---------- Rules: XP comes from pull requests, reviews, commits and issues in the selected repos ----------

// Opening a PR gives XP by size (lines = additions + deletions). The first bucket whose `maxLines` is above the size wins.
const PR_SIZES = [
  { id: 'XS', maxLines: 10, xp: 5 },
  { id: 'S', maxLines: 100, xp: 10 },
  { id: 'M', maxLines: 500, xp: 20 },
  { id: 'L', maxLines: Infinity, xp: 30 },
];

// XP per counted event. (Opening a PR is not here: its XP depends on the size, see PR_SIZES.)
// Commits are the cheap kind: a push of several commits is easy to inflate, so they have a daily cap.
const WEIGHTS = { reviews: 10, merges: 15, commits: 1, issues: 5 };

// Most events of a kind that give XP in one day (the ledger keeps the real count).
const DAILY_CAPS = { commits: 10 };

// Kinds kept in the per-day ledger (`activity.days[day]`) and reported in 'activity' deltas.
// The ledger also keeps `prsXp`: the XP of the PRs opened that day (it depends on each PR's size).
const KINDS = ['prs', 'reviews', 'merges', 'commits', 'issues'];

// Levels and stages. Cumulative XP to reach a level is `weeks * baseline`, interpolated linearly between
// the anchors [level, weeks], so everyone evolves at a similar pace whether they ship 5 or 50 PRs a week.
// After the last anchor each level costs `weeksPerLevelAfter` typical weeks.
const LEVELS = {
  anchors: [
    [1, 0],
    [5, 0.8], // Kid
    [10, 3.5], // Young
    [18, 9], // Adult
  ],
  weeksPerLevelAfter: 0.7,
};

// One entry per sprite stage (assets/pets/<id>_<1..4>.png). `level`: the level that unlocks the stage.
const STAGES = [
  { id: 'baby', name: 'Baby', level: 1 },
  { id: 'kid', name: 'Kid', level: 5 },
  { id: 'young', name: 'Young', level: 10 },
  { id: 'adult', name: 'Adult', level: 18 },
];

// Baseline = the person's typical weekly XP (XP per 7 days).
// - Measured over the last `windowDays` of recorded history, scaled to a week.
//   The span starts at the first recorded day, so a young history is not diluted by empty days.
// - With less than `minHistoryDays` of history there is no reliable signal: use `defaultWeekly`.
//   (120 = about 3 small PRs, 2 reviews and 2 merges.)
// - Never below `floorWeekly` (40 = two small PRs and a review), so an almost inactive user cannot level up trivially.
const BASELINE = { windowDays: 28, minHistoryDays: 7, defaultWeekly: 120, floorWeekly: 40 };

// Mood rules (see engine.moodFor). Three moods. Order: anxious, happy, else neutral.
const MOOD = {
  anxiousAfterDays: 2, // anxious: at least one open PR has waited for review this long
  happyMergeHours: 48, // happy: a PR merged within this time
  strongWeekRatio: 1.25, // happy: week XP / baseline at least this
};

// Commits come from pushes: each push needs one GitHub lookup. A sync resolves at most this many (newest first);
// the rest wait for the next sync. Pushes and commits already counted are remembered this many days, to count
// each only once (a rebase and force-push must not count the same commits again).
const PUSH_LOOKUPS_PER_SYNC = 25;
const COMMIT_KEEP_DAYS = 14;

// The PR list in the state keeps open PRs and PRs merged within this many days (older ones live on in the day ledger).
const PR_KEEP_MERGED_DAYS = 14;

// "How you earn XP", as the UI shows it (derived from PR_SIZES and WEIGHTS).
const XP_RULES = {
  sizes: PR_SIZES.map(({ id, maxLines, xp }) => ({ id, maxLines: Number.isFinite(maxLines) ? maxLines : null, xp })),
  review: WEIGHTS.reviews,
  merged: WEIGHTS.merges,
  commit: WEIGHTS.commits,
  commitsPerDay: DAILY_CAPS.commits,
  issue: WEIGHTS.issues,
};

module.exports = {
  SPECIES,
  STAGES,
  LEVELS,
  PR_SIZES,
  WEIGHTS,
  DAILY_CAPS,
  PUSH_LOOKUPS_PER_SYNC,
  COMMIT_KEEP_DAYS,
  KINDS,
  BASELINE,
  MOOD,
  PR_KEEP_MERGED_DAYS,
  XP_RULES,
};
