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

// Total XP needed to reach each stage.
const STAGES = [
  { id: 'egg', name: 'Egg', minXp: 0 },
  { id: 'baby', name: 'Baby', minXp: 10 },
  { id: 'kid', name: 'Kid', minXp: 250 },
  { id: 'teen', name: 'Teen', minXp: 1200 },
  { id: 'adult', name: 'Adult', minXp: 3500 },
];

// Points per activity type.
const WEIGHTS = { pushes: 1, prs: 4, merges: 3, reviews: 3, comments: 1, issues: 2 };

// Points in the last 7 days needed for each mood. Below `ok`: sad.
const MOOD_THRESHOLDS = { happy: 120, ok: 30 };
const MAX_HEARTS = 4;

// Local hours when the pet sleeps.
const SLEEP_HOURS = { from: 0, to: 7 };

module.exports = { SPECIES, STAGES, WEIGHTS, MOOD_THRESHOLDS, MAX_HEARTS, SLEEP_HOURS };
