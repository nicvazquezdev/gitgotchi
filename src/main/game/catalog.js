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

// Evolution pace, in "typical weeks" of the person's own activity.
// Stage XP threshold = minWeeks * baseline (see BASELINE), so everyone reaches Adult
// after about 9 weeks of their normal pace, whether they score 40 or 370 points a week.
// One entry per sprite stage (assets/pets/<id>_<1..4>.png). `level`: the level that unlocks the stage.
const STAGES = [
  { id: 'baby', name: 'Baby', level: 1, minWeeks: 0 },
  { id: 'kid', name: 'Kid', level: 5, minWeeks: 0.8 },
  { id: 'young', name: 'Young', level: 10, minWeeks: 3.5 },
  { id: 'adult', name: 'Adult', level: 18, minWeeks: 9 },
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
