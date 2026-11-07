const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  NAME_MAX,
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
} = require('../src/main/game/collection');
const { SPECIES, STAGES, BASELINE, DAILY_CAPS, WEIGHTS } = require('../src/main/game/catalog');
const { xpForLevel } = require('../src/main/game/levels');

const NOW = new Date(2026, 5, 15, 12); // Monday, June 15th
const TODAY = '2026-06-15';
const day = (counts = {}) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, commits: 0, issues: 0, ...counts });
const bornOn = (date) => new Date(...date, 9).toISOString();
const pet = (species, born, earned = {}, extra = {}) => ({
  species,
  name: species,
  bornAt: bornOn(born),
  earned,
  ...extra,
});
const credit = (pets, activePet, days) => creditXp({ pets, activePet, days, now: NOW });
const xpOf = (pets) => Object.fromEntries(Object.entries(pets).map(([id, p]) => [id, petXp(p)]));

describe('creditXp', () => {
  test('today’s XP goes to the active pet, and the same ledger again credits nothing', () => {
    const pets = { phoenix: pet('phoenix', [2026, 5, 1]) };
    const days = { [TODAY]: day({ reviews: 2 }) };
    const once = credit(pets, 'phoenix', days);
    assert.deepEqual(once.phoenix.earned, { [TODAY]: 2 * WEIGHTS.reviews });
    assert.equal(credit(once, 'phoenix', days), once); // the very same object: nothing to store
  });

  test('XP that arrives after switching goes to the new active pet; the old one keeps what it earned', () => {
    let pets = { phoenix: pet('phoenix', [2026, 5, 1]), koi: pet('koi', [2026, 5, 10]) };
    pets = credit(pets, 'phoenix', { [TODAY]: day({ reviews: 1 }) });
    pets = credit(pets, 'koi', { [TODAY]: day({ reviews: 3 }) }); // two more reviews came in after the switch
    assert.deepEqual(xpOf(pets), { phoenix: 10, koi: 20 });
    assert.deepEqual(pets.koi.earned, { [TODAY]: 20 });
  });

  test('only the active pet earns: the others keep their XP while the ledger grows', () => {
    let pets = { phoenix: pet('phoenix', [2026, 5, 1], { '2026-06-10': 100 }), koi: pet('koi', [2026, 5, 2]) };
    pets = credit(pets, 'koi', { '2026-06-10': day({ reviews: 10 }), [TODAY]: day({ merges: 2 }) });
    assert.deepEqual(xpOf(pets), { phoenix: 100, koi: 2 * WEIGHTS.merges });
  });

  test('a past day goes to the pet that earned most on it', () => {
    const pets = {
      phoenix: pet('phoenix', [2026, 5, 1], { '2026-06-10': 30 }),
      koi: pet('koi', [2026, 5, 2], { '2026-06-10': 5 }),
    };
    const next = credit(pets, 'koi', { '2026-06-10': day({ reviews: 5 }) }); // 50 XP: 15 are left
    assert.deepEqual([next.phoenix.earned['2026-06-10'], next.koi.earned['2026-06-10']], [45, 5]);
  });

  test('a past day nobody earned on goes to the active pet (the app was closed: it did not change)', () => {
    const pets = { phoenix: pet('phoenix', [2026, 5, 1]), koi: pet('koi', [2026, 5, 12]) };
    const days = { '2026-06-13': day({ reviews: 2 }) };
    assert.deepEqual(xpOf(credit(pets, 'phoenix', days)), { phoenix: 20, koi: 0 }); // not the younger pet
    assert.deepEqual(xpOf(credit(pets, 'koi', days)), { phoenix: 0, koi: 20 });
  });

  test('...unless the active pet had not hatched yet: then the youngest pet that existed that day', () => {
    const pets = {
      phoenix: pet('phoenix', [2026, 5, 1]),
      ram: pet('ram', [2026, 5, 4]),
      koi: pet('koi', [2026, 5, 12]), // hatched after the day below
    };
    const next = credit(pets, 'koi', { '2026-06-08': day({ reviews: 1 }) });
    assert.deepEqual(xpOf(next), { phoenix: 0, ram: 10, koi: 0 });
  });

  test('days before the first pet hatched are not credited (they only inform the baseline)', () => {
    const pets = { phoenix: pet('phoenix', [2026, 5, 10]) };
    const next = credit(pets, 'phoenix', { '2026-06-09': day({ reviews: 9 }), '2026-06-10': day({ reviews: 1 }) });
    assert.deepEqual(next.phoenix.earned, { '2026-06-10': 10 });
  });

  test('credits are never taken back: a smaller ledger (other repos) changes nothing, and a regrown one adds nothing', () => {
    const pets = { phoenix: pet('phoenix', [2026, 5, 1], { '2026-06-10': 80 }) };
    assert.equal(credit(pets, 'phoenix', { '2026-06-10': day({ reviews: 2 }) }), pets);
    assert.equal(credit(pets, 'phoenix', {}), pets);
    assert.equal(credit(pets, 'phoenix', { '2026-06-10': day({ reviews: 8 }) }), pets);
  });

  test('a day’s cap holds across pets: switching does not earn the commit XP twice', () => {
    const cap = DAILY_CAPS.commits;
    let pets = { phoenix: pet('phoenix', [2026, 5, 1]), koi: pet('koi', [2026, 5, 2]) };
    pets = credit(pets, 'phoenix', { [TODAY]: day({ commits: cap }) });
    pets = credit(pets, 'koi', { [TODAY]: day({ commits: cap + 6 }) }); // the real count grows, the XP does not
    assert.equal(xpOf(pets).phoenix + xpOf(pets).koi, cap * WEIGHTS.commits);
  });

  test('a PR that grows after the day it was opened gives the extra XP to the pet that opened it', () => {
    const opened = new Date(2026, 5, 12, 12);
    let pets = { phoenix: pet('phoenix', [2026, 5, 1]), koi: pet('koi', [2026, 5, 2]) };
    pets = creditXp({ pets, activePet: 'phoenix', days: { '2026-06-12': day({ prs: 1, prsXp: 5 }) }, now: opened });
    // Three days later, with the koi active, the PR is a medium one: the 15 XP more are the phoenix's.
    pets = credit(pets, 'koi', { '2026-06-12': day({ prs: 1, prsXp: 20 }) });
    assert.deepEqual(xpOf(pets), { phoenix: 20, koi: 0 });
  });

  test('does nothing without an active pet', () => {
    const pets = { phoenix: pet('phoenix', [2026, 5, 1]) };
    assert.equal(credit(pets, null, { [TODAY]: day({ reviews: 1 }) }), pets);
    assert.equal(credit(pets, 'koi', { [TODAY]: day({ reviews: 1 }) }), pets);
  });

  test('does not change the pets it is given', () => {
    const pets = { phoenix: pet('phoenix', [2026, 5, 1]) };
    credit(pets, 'phoenix', { [TODAY]: day({ reviews: 1 }) });
    assert.deepEqual(pets.phoenix.earned, {});
  });
});

describe('helpers', () => {
  test('petXp adds up the days, recentXp the last week only', () => {
    const p = pet('phoenix', [2026, 5, 1], { '2026-06-08': 40, '2026-06-09': 5, '2026-06-15': 7 });
    assert.equal(petXp(p), 52);
    assert.equal(recentXp(p, TODAY), 12); // the 8th is 7 days ago: out
    assert.equal(petXp({}), 0);
  });

  test('startDay is the day the first pet hatched', () => {
    assert.equal(startDay({ a: pet('a', [2026, 5, 9]), b: pet('b', [2026, 4, 30]) }), '2026-05-30');
    assert.equal(startDay({}), '');
  });

  test('earnedSince: the XP of each day from the birth day on, without empty days', () => {
    const days = { '2026-06-09': day({ reviews: 3 }), '2026-06-10': day({ reviews: 1 }), '2026-06-11': day() };
    assert.deepEqual(earnedSince(days, bornOn([2026, 5, 10])), { '2026-06-10': 10 });
  });

  test('names are trimmed, cut at the limit and default to the baby’s name', () => {
    const [phoenix] = SPECIES;
    assert.equal(cleanName('  Ember  ', phoenix), 'Ember');
    assert.equal(cleanName('x'.repeat(40), phoenix).length, NAME_MAX);
    assert.equal(cleanName('   ', phoenix), phoenix.stages[0].name);
    assert.equal(cleanName(undefined, phoenix), phoenix.stages[0].name);
  });

  test('a new pet is a baby without XP, hatched now', () => {
    const [phoenix] = SPECIES;
    const born = newPet(phoenix, 'Ember', NOW);
    assert.deepEqual(born, {
      species: 'phoenix',
      name: 'Ember',
      bornAt: NOW.toISOString(),
      stageIndex: null,
      earned: {},
    });
  });

  test('a single pet from before collections becomes a collection of one', () => {
    const old = {
      species: 'koi',
      name: 'Finn',
      bornAt: bornOn([2026, 5, 10]),
      achievements: { 'first-pr': '2026-06-11' },
    };
    const converted = fromSinglePet(old, { '2026-06-11': day({ merges: 1 }) });
    assert.equal(converted.activePet, 'koi');
    assert.deepEqual(converted.pets.koi.earned, { '2026-06-11': WEIGHTS.merges });
    assert.deepEqual(converted.achievements, { 'first-pr': '2026-06-11' });
    assert.deepEqual(fromSinglePet(null, {}), { pets: {}, activePet: null });
  });

  test('petFacts gives when each pet hatched and grew up', () => {
    const pets = { a: pet('a', [2026, 5, 9]), b: pet('b', [2026, 5, 10], {}, { matureAt: '2026-06-14' }) };
    assert.deepEqual(petFacts(pets), [
      { bornDay: '2026-06-09', matureDay: null },
      { bornDay: '2026-06-10', matureDay: '2026-06-14' },
    ]);
  });
});

describe('progressOf', () => {
  const baseline = BASELINE.defaultWeekly;
  const withXp = (xp, extra) => pet('phoenix', [2026, 0, 1], { '2026-01-02': xp }, extra);

  test('the level comes from the XP and the baseline; the bar is within the level', () => {
    const start = xpForLevel(4, baseline);
    const progress = progressOf(withXp(start + 10), baseline);
    assert.equal(progress.level, 4);
    assert.equal(progress.levelXp, 10);
    assert.equal(progress.levelXpNeeded, xpForLevel(5, baseline) - start);
    assert.equal(progress.stageIndex, 0);
  });

  test('it says what is left to the next stage, and nothing once the pet is fully grown', () => {
    const baby = progressOf(withXp(0), baseline);
    assert.deepEqual(
      [baby.nextStageLevel, baby.xpToNextStage, baby.mastered],
      [STAGES[1].level, xpForLevel(5, baseline), false],
    );
    const grown = progressOf(withXp(xpForLevel(STAGES[3].level, baseline)), baseline);
    assert.deepEqual(
      [grown.stageIndex, grown.nextStageLevel, grown.xpToNextStage, grown.mastered],
      [3, null, null, true],
    );
  });

  test('what a pet reached is never lost', () => {
    const progress = progressOf(withXp(0, { level: 12, stageIndex: 2 }), baseline);
    assert.deepEqual([progress.level, progress.stageIndex], [12, 2]);
    assert.equal(progressOf(withXp(0, { stageIndex: 3 }), baseline).level, STAGES[3].level);
  });
});

describe('collectionView', () => {
  const baseline = BASELINE.defaultWeekly;
  const pets = {
    koi: pet('koi', [2026, 5, 2], { '2026-06-14': 30, '2026-06-01': 500 }, { stageIndex: 1, level: 6 }),
    phoenix: pet('phoenix', [2026, 5, 1], { '2026-06-14': 5 }, { stageIndex: 3, level: 18, matureAt: '2026-06-12' }),
  };
  const view = collectionView({ pets, activePet: 'koi', baseline, now: NOW });

  test('has one entry per species, in the catalog’s order, with a fixed number each', () => {
    assert.deepEqual(
      view.entries.map((e) => e.id),
      SPECIES.map((s) => s.id),
    );
    assert.deepEqual(
      view.entries.map((e) => e.number),
      SPECIES.map((_, i) => i + 1),
    );
    assert.equal(view.total, SPECIES.length);
  });

  test('counts what is hatched and mastered, and marks the active pet', () => {
    assert.deepEqual([view.hatched, view.mastered, view.active], [2, 1, 'koi']);
    assert.deepEqual(
      view.entries.filter((e) => e.active).map((e) => e.id),
      ['koi'],
    );
  });

  test('a pet that is not hatched is only its place; a hatched one carries its progress', () => {
    const ram = view.entries.find((e) => e.id === 'ram');
    assert.deepEqual(ram, { id: 'ram', number: 2, hatched: false, active: false });
    const koiEntry = view.entries.find((e) => e.id === 'koi');
    assert.equal(koiEntry.name, 'koi');
    assert.equal(koiEntry.xp, 530);
    assert.equal(koiEntry.weekXp, 30); // the 500 XP of the 1st are not this week's
    assert.ok(koiEntry.level >= 6 && koiEntry.xpToNextStage > 0);
    const grown = view.entries.find((e) => e.id === 'phoenix');
    assert.deepEqual([grown.mastered, grown.matureAt, grown.xpToNextStage], [true, '2026-06-12', null]);
  });
});
