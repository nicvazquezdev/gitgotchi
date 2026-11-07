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
  { id: 'XS', name: 'Tiny', maxLines: 10, xp: 5 },
  { id: 'S', name: 'Small', maxLines: 100, xp: 10 },
  { id: 'M', name: 'Medium', maxLines: 500, xp: 20 },
  { id: 'L', name: 'Large', maxLines: Infinity, xp: 30 },
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

// ---------- Achievements ----------

// Counted from the pet's own history (since its birth day), like XP. `metric` is what is counted: a ledger kind
// (prs, reviews, merges, commits, issues), `streak` (best streak, see game/stats.js), `fullDays` (days with a PR
// opened, a review and a merge) or `quickMerges` (PRs merged soon after opening them). `quickMerges` reads the
// stored PR list, which only keeps recent PRs, so its target must be 1 (a reached achievement is stored and kept).
// `icon` names an icon of renderer/shared/ui.js.
const ACHIEVEMENT_RULES = { quickMergeMinutes: 60 };

const ACHIEVEMENT_GROUPS = [
  { id: 'prs', name: 'Pull requests' },
  { id: 'merges', name: 'Merges' },
  { id: 'reviews', name: 'Reviews' },
  { id: 'code', name: 'Commits and issues' },
  { id: 'streaks', name: 'Streaks', note: 'Weekends never break a streak' },
  { id: 'special', name: 'Special' },
];

// One family per metric (they share group, icon and metric); each step is [id, target, name, description].
const ACHIEVEMENT_FAMILIES = [
  {
    group: 'prs',
    icon: 'pr',
    metric: 'prs',
    steps: [
      ['first-pr', 1, 'First PR', 'Open your first pull request'],
      ['pr-10', 10, 'PR regular', 'Open 10 pull requests'],
      ['pr-50', 50, 'PR factory', 'Open 50 pull requests'],
    ],
  },
  {
    group: 'merges',
    icon: 'merge',
    metric: 'merges',
    steps: [
      ['first-merge', 1, 'First merge', 'Get a pull request merged'],
      ['merge-10', 10, 'Shipper', 'Get 10 pull requests merged'],
      ['merge-50', 50, 'Release train', 'Get 50 pull requests merged'],
    ],
  },
  {
    group: 'reviews',
    icon: 'eye',
    metric: 'reviews',
    steps: [
      ['first-review', 1, 'First review', "Review someone else's pull request"],
      ['review-10', 10, 'Second pair of eyes', 'Submit 10 reviews'],
      ['review-50', 50, 'Code guardian', 'Submit 50 reviews'],
      ['review-100', 100, 'Review machine', 'Submit 100 reviews'],
    ],
  },
  {
    group: 'code',
    icon: 'commit',
    metric: 'commits',
    steps: [
      ['commit-100', 100, 'Commit habit', 'Push 100 commits'],
      ['commit-500', 500, 'Commit marathon', 'Push 500 commits'],
    ],
  },
  {
    group: 'code',
    icon: 'issue',
    metric: 'issues',
    steps: [
      ['first-issue', 1, 'First issue', 'Open an issue'],
      ['issue-10', 10, 'Issue hunter', 'Open 10 issues'],
    ],
  },
  {
    group: 'streaks',
    icon: 'flame',
    metric: 'streak',
    steps: [
      ['streak-3', 3, 'Warming up', 'Be active 3 days in a row'],
      ['streak-5', 5, 'Full work week', 'Be active 5 days in a row'],
      ['streak-10', 10, 'Two weeks strong', 'Be active 10 days in a row'],
      ['streak-20', 20, 'A month of work', 'Be active 20 days in a row'],
    ],
  },
  {
    group: 'special',
    icon: 'bolt',
    metric: 'quickMerges',
    steps: [['quick-merge', 1, 'Speed run', 'Get a PR merged within an hour of opening it']],
  },
  {
    group: 'special',
    icon: 'cycle',
    metric: 'fullDays',
    steps: [['full-cycle', 1, 'Full cycle', 'Open a PR, submit a review and get a PR merged on the same day']],
  },
];

const ACHIEVEMENTS = ACHIEVEMENT_FAMILIES.flatMap(({ steps, ...shared }) =>
  steps.map(([id, target, name, description]) => ({ id, ...shared, name, description, target })),
);

// "How you earn XP", as the UI shows it (derived from PR_SIZES and WEIGHTS).
const XP_RULES = {
  sizes: PR_SIZES.map(({ id, name, maxLines, xp }) => ({
    id,
    name,
    maxLines: Number.isFinite(maxLines) ? maxLines : null,
    xp,
  })),
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
  ACHIEVEMENT_RULES,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENTS,
};
