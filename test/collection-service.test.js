const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { emptyActivity } = require('../src/main/game/engine');
const { petXp } = require('../src/main/game/collection');
const { SPECIES, STAGES, BASELINE } = require('../src/main/game/catalog');
const { xpForLevel } = require('../src/main/game/levels');
const { toDay } = require('../src/main/dates');

// Like achievements-sync.test.js: the service talks to the store and to GitHub, so both are replaced.
const src = (file) => path.join(__dirname, '../src/main', file);
const fake = (file, exports) => {
  require.cache[src(file)] = { id: src(file), filename: src(file), loaded: true, exports };
};

let state;
let events;
fake('store.js', {
  get: () => state,
  update: (patch) => (state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) }),
});
fake('services/session.js', { isConnected: () => true, client: async () => gh });
const SERVICE = src('services/pet-service.js');

const gh = {
  reviewRequests: async () => [],
  activity: async () => events,
  pullRequestsSince: async () => [],
  pushCommits: async () => [],
};
const TODAY = toDay(new Date());
const review = () => ({ kind: 'reviews', repo: 'a/b', day: TODAY });
const born = (species, name = species) => ({
  species,
  name,
  bornAt: '2026-01-01T00:00:00Z',
  stageIndex: 0,
  level: 1,
  earned: {},
});

let petService;
let heard;

beforeEach(() => {
  state = {
    user: { login: 'me' },
    repos: ['a/b'],
    pets: { phoenix: born('phoenix', 'Pixel') },
    activePet: 'phoenix',
    activity: emptyActivity(),
    profileUpdatedAt: null,
  };
  events = [];
  delete require.cache[SERVICE];
  petService = require(SERVICE);
  heard = { companion: [], configured: 0, levelUp: [], evolved: [] };
  petService.on('companion', (c) => heard.companion.push(c));
  petService.on('configured', () => heard.configured++);
  petService.on('levelUp', (level) => heard.levelUp.push(level));
  petService.on('evolved', (stage) => heard.evolved.push(stage.index));
});

test('hatching adds a baby with no XP, makes it the active pet and tells everyone', () => {
  petService.hatch({ species: 'koi', name: '  Finn ' });
  assert.equal(state.activePet, 'koi');
  assert.deepEqual(Object.keys(state.pets).sort(), ['koi', 'phoenix']);
  const { koi } = state.pets;
  assert.deepEqual([koi.name, koi.earned, koi.level, koi.stageIndex], ['Finn', {}, 1, 0]); // recorded as a baby
  assert.ok(state.profileUpdatedAt);
  assert.deepEqual(heard.companion, [{ kind: 'hatched', species: 'koi', name: 'Finn' }]);
  assert.equal(heard.configured, 1);
  assert.deepEqual(heard.levelUp.concat(heard.evolved), []); // a new pet does not "level up" to level 1
  assert.equal(petService.status().name, 'Finn');
  assert.equal(petService.status().collection.hatched, 2);
});

test('a pet without a name gets its baby’s name; the same species cannot be hatched twice, nor an unknown one', () => {
  petService.hatch({ species: 'koi' });
  assert.equal(state.pets.koi.name, SPECIES.find((s) => s.id === 'koi').stages[0].name);
  assert.throws(() => petService.hatch({ species: 'koi' }), /already in your collection/);
  assert.throws(() => petService.hatch({ species: 'dodo' }), /Unknown pet species/);
  assert.equal(Object.keys(state.pets).length, 2);
});

test('switching changes who is active, keeps every pet as it was and is announced', () => {
  state.pets.koi = { ...born('koi', 'Finn'), earned: { '2026-05-01': 40 } };
  petService.activate('koi');
  assert.equal(state.activePet, 'koi');
  assert.equal(petXp(state.pets.koi), 40);
  assert.deepEqual(heard.companion, [{ kind: 'switched', species: 'koi', name: 'Finn' }]);
  petService.activate('koi'); // already active: nothing to do
  assert.equal(heard.companion.length, 1);
  assert.throws(() => petService.activate('ram'), /not in your collection/);
  assert.equal(state.activePet, 'koi');
});

test('only the active pet earns: XP that arrives after switching goes to the new pet', async () => {
  await petService.sync(); // baseline
  events = [review()];
  await petService.sync();
  assert.deepEqual([petXp(state.pets.phoenix)], [10]);

  state.pets.koi = born('koi');
  petService.activate('koi');
  events = [review(), review(), review()]; // two more reviews since
  await petService.sync();
  assert.equal(petXp(state.pets.phoenix), 10); // it keeps what it had
  assert.equal(petXp(state.pets.koi), 20);
  const { entries } = petService.status().collection;
  assert.deepEqual(
    entries.filter((e) => e.hatched).map((e) => [e.id, e.active, e.xp]),
    [
      ['phoenix', false, 10],
      ['koi', true, 20],
    ],
  );
});

test('renaming trims, cuts the name and falls back to the baby’s name; an unchanged name is not news', () => {
  petService.rename({ species: 'phoenix', name: ' Ember ' });
  assert.equal(state.pets.phoenix.name, 'Ember');
  assert.equal(heard.configured, 1);
  petService.rename({ species: 'phoenix', name: 'Ember' });
  assert.equal(heard.configured, 1);
  petService.rename({ species: 'phoenix', name: 'x'.repeat(40) });
  assert.equal(state.pets.phoenix.name.length, 16);
  petService.rename({ species: 'phoenix', name: '  ' });
  assert.equal(state.pets.phoenix.name, SPECIES[0].stages[0].name);
  assert.throws(() => petService.rename({ species: 'ram', name: 'x' }), /not in your collection/);
});

test('the setup flow: the first setup needs a companion; later it only changes the repos unless one is picked', async () => {
  state = { ...state, pets: {}, activePet: null, repos: [] };
  await assert.rejects(() => petService.configure({ repos: ['a/b'] }), /Pick a companion/);
  await assert.rejects(() => petService.configure({ repos: [], species: 'koi' }), /at least one repo/);
  await assert.rejects(() => petService.configure({ repos: ['a/b'], species: 'dodo' }), /Unknown pet species/);

  await petService.configure({ repos: ['a/b'], species: 'koi', name: 'Finn' });
  assert.deepEqual([state.activePet, state.pets.koi.name, state.repos], ['koi', 'Finn', ['a/b']]);

  await petService.configure({ repos: ['a/b', 'a/c'] }); // "Change…": only the repos
  assert.deepEqual([state.activePet, state.repos], ['koi', ['a/b', 'a/c']]);

  await petService.configure({ repos: ['a/b', 'a/c'], species: 'phoenix' }); // a new species hatches
  assert.deepEqual([state.activePet, Object.keys(state.pets).sort()], ['phoenix', ['koi', 'phoenix']]);

  await petService.configure({ repos: ['a/b', 'a/c'], species: 'koi', name: 'Fin' }); // an owned one is picked and renamed
  assert.deepEqual([state.activePet, state.pets.koi.name], ['koi', 'Fin']);
});

test('new repos rebuild the history but never take XP away from the pets', async () => {
  state.pets.phoenix.earned = { '2026-05-01': 70 };
  state.activity.days = { '2026-05-01': { reviews: 7, prs: 0, prsXp: 0, merges: 0, commits: 0, issues: 0 } };
  await petService.configure({ repos: ['a/other'] });
  assert.deepEqual(state.activity, emptyActivity());
  assert.equal(petXp(state.pets.phoenix), 70);
  await petService.sync();
  assert.equal(petXp(state.pets.phoenix), 70);
});

test('every pet records its level and stage, but only the active pet celebrates them', async () => {
  const level5 = xpForLevel(STAGES[1].level, BASELINE.defaultWeekly); // a new person: the default baseline
  state.pets.phoenix.earned = { '2026-05-01': level5 }; // active: has just enough to evolve into a kid
  state.pets.koi = { ...born('koi'), earned: { '2026-05-01': xpForLevel(STAGES[3].level, BASELINE.defaultWeekly) } };
  await petService.sync();
  assert.deepEqual(heard.levelUp, [STAGES[1].level]);
  assert.deepEqual(heard.evolved, [1]);
  assert.deepEqual([state.pets.phoenix.level, state.pets.phoenix.stageIndex], [STAGES[1].level, 1]);
  // The benched one grew up too (it is worth that much XP): recorded, with the day, without a party.
  assert.deepEqual([state.pets.koi.stageIndex, state.pets.koi.matureAt], [3, TODAY]);
  assert.equal('matureAt' in state.pets.phoenix, false);
  await petService.sync();
  assert.equal(state.pets.koi.matureAt, TODAY); // recorded once
  assert.deepEqual(heard.evolved, [1]);
});
