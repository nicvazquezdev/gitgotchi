// Pure collection rules: the pets a person has, the XP each one has earned, and the view of the whole collection.
// No I/O. There is one pet per species (the species id is the pet's id) and only the active pet earns XP.
//
// A pet keeps its XP per day (`pet.earned[day]`). The day ledger (`activity.days`) says how much XP each day gave;
// `creditXp` hands every XP of it that no pet has been credited yet to a pet, and a pet's XP is the sum of its days.
// Nothing here is ever taken back: XP, levels and stages only grow, so merging two computers is a max per day.
const { SPECIES, STAGES } = require('./catalog');
const { dayXp } = require('./stats');
const { xpForLevel, levelAt, stageIndexFor } = require('./levels');
const { toDay, addDays } = require('../dates');

const NAME_MAX = 16;
const LAST_STAGE = STAGES.length - 1;
const WEEK_DAYS = 7;

const speciesOf = (id) => SPECIES.find((s) => s.id === id);

/** The name a pet gets: what was typed, or the name of its baby form. */
const cleanName = (name, species) =>
  String(name ?? '')
    .trim()
    .slice(0, NAME_MAX) || species.stages[0].name;

/** A pet that hatches `now`: a baby with no XP. */
const newPet = (species, name, now = new Date()) => ({
  species: species.id,
  name: cleanName(name, species),
  bornAt: now.toISOString(),
  stageIndex: null,
  earned: {},
});

/** XP a pet has earned in all. */
const petXp = (pet) => Object.values(pet.earned ?? {}).reduce((sum, xp) => sum + xp, 0);

/** XP a pet has earned in the `days` days up to `today` (the last week by default). */
function recentXp(pet, today, days = WEEK_DAYS) {
  const from = addDays(today, -(days - 1));
  return Object.entries(pet.earned ?? {}).reduce((sum, [day, xp]) => (day >= from && day <= today ? sum + xp : sum), 0);
}

/** The day the first pet hatched ('' without pets): the activity of the person counts from here. */
function startDay(pets) {
  const days = Object.values(pets ?? {}).map((pet) => toDay(pet.bornAt));
  return days.length ? days.reduce((a, b) => (a < b ? a : b)) : '';
}

/** What a pet that lived since `bornAt` would have earned in a ledger: the XP of each day from its birth day on. */
function earnedSince(days, bornAt) {
  const birth = toDay(bornAt);
  return Object.fromEntries(
    Object.entries(days ?? {})
      .filter(([day, d]) => day >= birth && dayXp(d) > 0)
      .map(([day, d]) => [day, dayXp(d)]),
  );
}

/**
 * The collection a single pet from before collections becomes (state.json and cloud saves used to hold one `pet`):
 * a collection of one, active, with the XP its days since birth gave (what its XP was) and, if it had them, the
 * achievements it recorded (they now belong to the person).
 * @returns {{ pets: object, activePet: string | null, achievements?: object }}
 */
function fromSinglePet(pet, days) {
  if (!pet) return { pets: {}, activePet: null };
  const { achievements, ...own } = pet;
  return {
    pets: { [pet.species]: { ...own, earned: earnedSince(days, pet.bornAt) } },
    activePet: pet.species,
    ...(achievements && { achievements }),
  };
}

/**
 * Credits the XP of the ledger that no pet has yet. For each day since the first pet hatched, what the day gave
 * minus what the pets were credited on it goes to one pet:
 * - today: the active pet (new XP always goes to whoever is being raised);
 * - an earlier day: the pet that earned most on it; if nobody did (the app was closed, or the history was rebuilt
 *   after changing repos) the active pet, since it does not change while the app is closed, unless it had not
 *   hatched yet: then the youngest pet that existed that day.
 * Credits are never taken back, so a smaller ledger changes nothing and the same ledger twice credits nothing new.
 * XP is counted per day, so the caps of a day (commits) hold across pets.
 * @param {{ pets: object, activePet: string, days: object, now?: Date }} input
 * @returns the same `pets` object when nothing was credited, else a new one
 */
function creditXp({ pets, activePet, days, now = new Date() }) {
  if (!pets[activePet]) return pets;
  const ids = Object.keys(pets);
  const today = toDay(now);
  const since = startDay(pets);
  const bornDay = Object.fromEntries(ids.map((id) => [id, toDay(pets[id].bornAt)]));
  const youngestFirst = [...ids].sort((a, b) => bornDay[b].localeCompare(bornDay[a]));

  const ownerOf = (day) => {
    if (day >= today) return activePet;
    const top = ids
      .filter((id) => pets[id].earned?.[day] > 0)
      .sort((a, b) => pets[b].earned[day] - pets[a].earned[day])[0];
    if (top) return top;
    return bornDay[activePet] <= day ? activePet : (youngestFirst.find((id) => bornDay[id] <= day) ?? activePet);
  };

  const earned = {}; // pet id -> its `earned` with the new credits
  for (const [day, ledgerDay] of Object.entries(days)) {
    if (day < since) continue;
    const credited = ids.reduce((sum, id) => sum + (pets[id].earned?.[day] ?? 0), 0);
    const gap = dayXp(ledgerDay) - credited;
    if (gap <= 0) continue;
    const owner = ownerOf(day);
    earned[owner] ??= { ...pets[owner].earned };
    earned[owner][day] = (earned[owner][day] ?? 0) + gap;
  }
  if (!Object.keys(earned).length) return pets;
  return Object.fromEntries(ids.map((id) => [id, earned[id] ? { ...pets[id], earned: earned[id] } : pets[id]]));
}

/**
 * Where a pet stands: its XP, level and stage, and what is left to the next level and the next stage.
 * The level follows the person's baseline, but what a pet reached is never lost (`pet.level`, `pet.stageIndex`).
 */
function progressOf(pet, baseline) {
  const xp = petXp(pet);
  const stageFloor = pet.stageIndex ?? 0;
  const level = Math.max(levelAt(xp, baseline), pet.level ?? 1, STAGES[stageFloor].level);
  const stageIndex = Math.max(stageIndexFor(level), stageFloor);
  const levelStart = xpForLevel(level, baseline);
  const levelXpNeeded = xpForLevel(level + 1, baseline) - levelStart;
  const next = STAGES[stageIndex + 1] ?? null;
  return {
    xp,
    level,
    stageIndex,
    levelXp: Math.min(levelXpNeeded, Math.max(0, xp - levelStart)),
    levelXpNeeded,
    nextStageLevel: next?.level ?? null,
    xpToNextStage: next ? Math.max(0, xpForLevel(next.level, baseline) - xp) : null,
    mastered: stageIndex === LAST_STAGE,
  };
}

/**
 * The whole collection for the UI: one entry per species in the catalog's order (a fixed place for each, like a
 * dex), the ones not hatched yet are `{ id, number, hatched: false }`.
 * @returns {{ active: string, total: number, hatched: number, mastered: number, entries: object[] }}
 */
function collectionView({ pets, activePet, baseline, now = new Date() }) {
  const today = toDay(now);
  const entries = SPECIES.map(({ id }, i) => {
    const pet = pets[id];
    if (!pet) return { id, number: i + 1, hatched: false, active: false };
    return {
      id,
      number: i + 1,
      hatched: true,
      active: id === activePet,
      name: pet.name,
      bornAt: pet.bornAt,
      matureAt: pet.matureAt ?? null,
      weekXp: recentXp(pet, today),
      ...progressOf(pet, baseline),
    };
  });
  return {
    active: activePet,
    total: SPECIES.length,
    hatched: entries.filter((e) => e.hatched).length,
    mastered: entries.filter((e) => e.mastered).length,
    entries,
  };
}

/** When each pet hatched and grew up (days), as the achievements need them. */
const petFacts = (pets) =>
  Object.values(pets ?? {}).map((pet) => ({ bornDay: toDay(pet.bornAt), matureDay: pet.matureAt ?? null }));

module.exports = {
  NAME_MAX,
  speciesOf,
  cleanName,
  newPet,
  petXp,
  recentXp,
  startDay,
  earnedSince,
  fromSinglePet,
  creditXp,
  progressOf,
  collectionView,
  petFacts,
};
