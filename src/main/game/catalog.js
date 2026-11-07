// Game data: species, evolution stages and scoring rules.
// The UI receives this catalog over IPC, so there is a single source of truth.

// `palette` is only used by the placeholder sprites until the real ones arrive.
const SPECIES = [
  {
    id: 'blob',
    name: 'Blobby',
    blurb: 'Calm and loyal.',
    palette: { body: '#7bd88f', shade: '#3e9e5a', accent: '#ffffff' },
  },
  {
    id: 'cat',
    name: 'Bytecat',
    blurb: "Naps when you don't push.",
    palette: { body: '#f6b26b', shade: '#c27c35', accent: '#ffe7c7' },
  },
  {
    id: 'dragon',
    name: 'Mergon',
    blurb: 'Feeds on PRs.',
    palette: { body: '#a78bfa', shade: '#6d4fd1', accent: '#fde68a' },
  },
  {
    id: 'bot',
    name: 'Botty',
    blurb: 'Loves code reviews.',
    palette: { body: '#7dd3fc', shade: '#3b8fb8', accent: '#f87171' },
  },
];

// Evolution pace, in "typical weeks" of the person's own activity.
// Stage XP threshold = minWeeks * baseline (see BASELINE), so everyone reaches Adult
// after about 9 weeks of their normal pace, whether they score 40 or 370 points a week.
const STAGES = [
  { id: 'egg', name: 'Egg', minWeeks: 0 },
  { id: 'baby', name: 'Baby', minWeeks: 0.1 },
  { id: 'kid', name: 'Kid', minWeeks: 0.8 },
  { id: 'teen', name: 'Teen', minWeeks: 3.5 },
  { id: 'adult', name: 'Adult', minWeeks: 9 },
];

// Points per activity type.
const WEIGHTS = { pushes: 1, prs: 4, merges: 3, reviews: 3, comments: 1, issues: 2 };

// Baseline = the person's typical weekly score (points per 7 days).
// - Measured over the last `windowDays` of recorded history, scaled to a week.
//   The span starts at the first recorded day, so a young history is not diluted by empty days.
// - With less than `minHistoryDays` of history there is no reliable signal: use `defaultWeekly`.
// - Never below `floorWeekly`, so an almost inactive user cannot max everything out trivially.
const BASELINE = { windowDays: 28, minHistoryDays: 7, defaultWeekly: 100, floorWeekly: 25 };

// Mood from weekScore / baseline. Below `ok`: sad.
const MOOD_RATIOS = { happy: 1.0, ok: 0.4 };
const MAX_HEARTS = 4;

// Local hours when the pet sleeps.
const SLEEP_HOURS = { from: 0, to: 7 };

module.exports = { SPECIES, STAGES, WEIGHTS, BASELINE, MOOD_RATIOS, MAX_HEARTS, SLEEP_HOURS };
