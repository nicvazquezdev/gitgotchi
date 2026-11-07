// Game data: species, evolution stages and scoring rules.
// The UI receives this catalog over IPC, so there is a single source of truth.

// Sprite metadata (files, native sizes, shadow ellipses, creature names per stage) comes from
// assets/pets/sprites.json, exported by the sprite tool. The English copy for each line lives here.
const SPRITES = require('../../../assets/pets/sprites.json');

const SPECIES_COPY = {
  fenix: { name: 'Phoenix', blurb: "An ember chick reborn in flames until it's crowned a phoenix." },
  carnero: { name: 'Storm Ram', blurb: 'A cloud lamb that grows into the ram of thunder.' },
  polilla: { name: 'Moon Moth', blurb: 'A fluffy moth that grows into the lantern queen of the night.' },
  medusa: { name: 'Aurora', blurb: 'An aurora jellyfish whose glowing core grows into a queen of light.' },
  geoda: { name: 'Geode', blurb: 'A crystal pebble that grows into a geode guardian.' },
  hongo: { name: 'Mushroom', blurb: 'A forest spirit that grows from a tiny mushroom into a glowing elder.' },
  celeste: { name: 'Celestial', blurb: 'A deer made of night sky: a moon on its brow, crystal antlers in the end.' },
  koi: { name: 'Koi', blurb: 'The legend of the koi that climbs the waterfall and becomes a dragon.' },
};

// A faint shadow means the creature hovers (jellyfish, koi, flying moth and phoenix).
const FLOAT_SHADOW_ALPHA = 0.6;

const SPECIES = SPRITES.map(({ id, bg, stages }) => ({
  id,
  ...SPECIES_COPY[id],
  color: bg,
  stages: stages.map(({ name, file, shadow, size, shadowEllipse }) => ({
    name, // creature name at this stage (proper noun from the sprite set)
    file,
    shadow,
    size, // native px (square canvas)
    shadowEllipse, // native px; sprites are aligned on its center so every stage stands on the same floor
    floats: shadowEllipse.alpha <= FLOAT_SHADOW_ALPHA,
  })),
}));

// Evolution pace, in "typical weeks" of the person's own activity.
// Stage XP threshold = minWeeks * baseline (see BASELINE), so everyone reaches Adult
// after about 9 weeks of their normal pace, whether they score 40 or 370 points a week.
// One entry per sprite stage (assets/pets/<id>_<1..4>.png).
const STAGES = [
  { id: 'baby', name: 'Baby', minWeeks: 0 },
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
