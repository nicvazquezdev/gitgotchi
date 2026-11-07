const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { repoId, toSave, isSave, remoteWins, mergeSave, saveSummary } = require('../src/main/cloud/save');

const pet = { species: 'phoenix', name: 'Cindle', bornAt: '2026-11-01T00:00:00Z', stageIndex: 0, earned: {} };
const koi = { species: 'koi', name: 'Finn', bornAt: '2026-11-04T00:00:00Z', stageIndex: 0, earned: {} };
const state = (over = {}) => ({
  pets: { phoenix: pet },
  activePet: 'phoenix',
  repos: ['me/app'],
  profileUpdatedAt: '2026-11-02T00:00:00Z',
  activity: { days: { '2026-11-03': { reviews: 2 } }, lastSyncedAt: 'local' },
  position: { x: 1, y: 2 },
  petSize: 300,
  ...over,
});
const fresh = { pets: {}, activePet: null, repos: [], profileUpdatedAt: null, activity: { days: {} } };

test('toSave keeps the pets, which repos and the history, not device settings', () => {
  const save = toSave(state({ user: { login: 'me' } }));
  assert.ok(isSave(save));
  assert.deepEqual(save.profile.pets, { phoenix: pet });
  assert.equal(save.profile.activePet, 'phoenix');
  assert.deepEqual(save.profile.repoIds, [repoId('me', 'me/app')]);
  assert.equal(save.position, undefined);
  assert.equal(save.petSize, undefined);
  assert.equal(save.activity.lastSyncedAt, undefined);
});

test('restoring into a fresh computer takes the remote pets, the active one and the history', () => {
  const remote = toSave(state({ pets: { phoenix: pet, koi }, activePet: 'koi' }));
  const merged = mergeSave(fresh, remote, ['me/app']);
  assert.deepEqual(merged.pets, { phoenix: pet, koi });
  assert.equal(merged.activePet, 'koi');
  assert.deepEqual(merged.repos, ['me/app']);
  assert.equal(merged.activity.days['2026-11-03'].reviews, 2);
});

test('history merges with the max per day and kind', () => {
  const remote = toSave(state({ activity: { days: { '2026-11-03': { reviews: 5 }, '2026-11-04': { merges: 1 } } } }));
  const merged = mergeSave(state(), remote);
  assert.equal(merged.activity.days['2026-11-03'].reviews, 5);
  assert.equal(merged.activity.days['2026-11-04'].merges, 1);
  assert.equal(merged.activity.lastSyncedAt, 'local');
});

describe('the collections of two computers', () => {
  const remoteOf = (over) => toSave(state({ profileUpdatedAt: '2026-11-05T00:00:00Z', ...over }));

  test('are both kept: a pet that is only on one computer is never lost', () => {
    const merged = mergeSave(state(), remoteOf({ pets: { koi }, activePet: 'koi' }));
    assert.deepEqual(Object.keys(merged.pets).sort(), ['koi', 'phoenix']);
    assert.equal(merged.activePet, 'koi'); // the remote profile is the newer one
    const local = state({ pets: { phoenix: pet, koi }, activePet: 'koi', profileUpdatedAt: '2026-11-09T00:00:00Z' });
    const older = mergeSave(local, remoteOf({ pets: { phoenix: pet }, activePet: 'phoenix' }));
    assert.deepEqual(Object.keys(older.pets).sort(), ['koi', 'phoenix']);
    assert.equal(older.activePet, 'koi'); // the local profile is the newer one
  });

  test('a pet on both keeps the XP of each day (max), the highest level and stage, and the winner’s name', () => {
    const local = state({
      pets: {
        phoenix: { ...pet, name: 'Local', earned: { '2026-11-02': 30, '2026-11-03': 10 }, level: 4, stageIndex: 0 },
      },
    });
    const remote = remoteOf({
      pets: {
        phoenix: { ...pet, name: 'Remote', earned: { '2026-11-03': 25, '2026-11-04': 5 }, level: 6, stageIndex: 1 },
      },
    });
    const { phoenix } = mergeSave(local, remote).pets;
    assert.equal(phoenix.name, 'Remote'); // its profile is the newer one
    assert.deepEqual(phoenix.earned, { '2026-11-02': 30, '2026-11-03': 25, '2026-11-04': 5 });
    assert.deepEqual([phoenix.level, phoenix.stageIndex], [6, 1]);
    assert.equal(mergeSave({ ...local, profileUpdatedAt: '2026-11-09T00:00:00Z' }, remote).pets.phoenix.name, 'Local');
  });

  test('a pet never recorded (no level, no stage yet) stays that way, and the earliest birth and maturity win', () => {
    const merged = mergeSave(
      state({ pets: { phoenix: { ...pet, stageIndex: null } } }),
      remoteOf({ pets: { phoenix: { ...pet, stageIndex: null, bornAt: '2026-10-30T00:00:00Z' } } }),
    ).pets.phoenix;
    assert.equal(merged.stageIndex, null);
    assert.equal('level' in merged, false);
    assert.equal(merged.bornAt, '2026-10-30T00:00:00Z');
    const grown = mergeSave(
      state({ pets: { phoenix: { ...pet, matureAt: '2026-11-20' } } }),
      remoteOf({ pets: { phoenix: { ...pet, matureAt: '2026-11-18' } } }),
    ).pets.phoenix;
    assert.equal(grown.matureAt, '2026-11-18');
  });

  test('the active pet follows the newest profile, and falls back to a pet that exists', () => {
    const local = state({ pets: { phoenix: pet, koi }, activePet: 'phoenix' });
    assert.equal(mergeSave(local, remoteOf({ pets: { koi }, activePet: 'koi' })).activePet, 'koi');
    // A remote profile that points at a pet nobody has keeps the local choice.
    assert.equal(mergeSave(local, remoteOf({ activePet: 'ram' })).activePet, 'phoenix');
    assert.equal(mergeSave(fresh, remoteOf({ activePet: 'ram' })).activePet, 'phoenix');
  });
});

test('the most recently changed profile wins the repos', () => {
  const remote = toSave(state({ repos: ['me/app', 'me/api'], profileUpdatedAt: '2026-11-05T00:00:00Z' }));
  const merged = mergeSave(state(), remote, ['me/app', 'me/api']);
  assert.deepEqual(merged.repos, ['me/app', 'me/api']);
  assert.equal(merged.profileUpdatedAt, '2026-11-05T00:00:00Z');
});

test('saveSummary describes the active pet and how many there are', () => {
  const summary = saveSummary(toSave(state({ pets: { phoenix: pet, koi }, activePet: 'koi' })));
  assert.equal(summary.name, 'Finn');
  assert.equal(summary.speciesId, 'koi');
  assert.equal(summary.count, 2);
  assert.ok(summary.level >= 1);
  assert.equal(isSave({ app: 'other' }), false);
  assert.equal(saveSummary(toSave(state({ pets: {}, activePet: null }))), null);
});

test('achievements belong to the person: both computers’ sets are kept (earliest day)', () => {
  const local = state({ achievements: { 'first-pr': '2026-11-03', 'review-10': '2026-11-05' } });
  const remote = toSave(
    state({
      achievements: { 'first-pr': '2026-11-02', 'first-merge': '2026-11-04' },
      profileUpdatedAt: '2026-11-04T00:00:00Z',
    }),
  );
  assert.deepEqual(remote.profile.achievements, { 'first-pr': '2026-11-02', 'first-merge': '2026-11-04' });
  assert.deepEqual(mergeSave(local, remote).achievements, {
    'first-pr': '2026-11-02',
    'first-merge': '2026-11-04',
    'review-10': '2026-11-05',
  });
});

test('without achievements on both sides there are none (the first check records silently)', () => {
  const merged = mergeSave(state(), toSave(state({ profileUpdatedAt: '2026-11-04T00:00:00Z' })));
  assert.equal('achievements' in merged, false);
});

test('the save never contains the name of a repo, only ids', () => {
  const save = toSave(state({ user: { login: 'me' }, repos: ['acme/secret-project', 'acme/web-app'] }));
  const text = JSON.stringify(save);
  assert.ok(!text.includes('secret-project') && !text.includes('web-app') && !text.includes('acme'));
  assert.equal(save.profile.repos, undefined);
  assert.equal(save.profile.repoIds.length, 2);
  assert.ok(save.profile.repoIds.every((id) => /^[0-9a-f]{16}$/.test(id)));
  assert.equal(save.schema, 3);
});

describe('repoId', () => {
  test('is the same for the same account and repo, however it is written', () => {
    assert.equal(repoId('Me', 'Acme/Web-App'), repoId('me', 'acme/web-app'));
  });

  test('differs between repos and between accounts', () => {
    assert.notEqual(repoId('me', 'acme/web-app'), repoId('me', 'acme/api'));
    assert.notEqual(repoId('me', 'acme/web-app'), repoId('you', 'acme/web-app'));
  });
});

describe('a save from before the collection (one `pet`, schemas 1 and 2)', () => {
  const legacyPet = { ...pet, level: 3, achievements: { 'first-pr': '2026-11-03' } };
  delete legacyPet.earned;
  const legacy = (extra = {}) => ({
    app: 'gitgotchi',
    schema: 1,
    profile: { pet: legacyPet, repos: ['me/app', 'me/api'], updatedAt: '2026-11-05T00:00:00Z', ...extra },
    activity: { days: { '2026-10-30': { reviews: 9 }, '2026-11-03': { reviews: 2 } } },
  });

  test('is still read: a collection of one, active, with the XP its days since birth gave', () => {
    assert.ok(isSave(legacy()));
    const merged = mergeSave(fresh, legacy());
    assert.deepEqual(Object.keys(merged.pets), ['phoenix']);
    assert.equal(merged.activePet, 'phoenix');
    assert.deepEqual(merged.pets.phoenix.earned, { '2026-11-03': 20 }); // the review before its birth is not its XP
    assert.equal(merged.pets.phoenix.level, 3);
    assert.deepEqual(merged.achievements, { 'first-pr': '2026-11-03' }); // now the person's
    assert.equal('achievements' in merged.pets.phoenix, false);
  });

  test('its repo names are used when no ids were resolved, and the next save has ids only', () => {
    const merged = mergeSave(fresh, legacy());
    assert.deepEqual(merged.repos, ['me/app', 'me/api']);
    const next = toSave({ ...fresh, ...merged, user: { login: 'me' } });
    assert.equal(next.profile.repos, undefined);
    assert.equal(next.profile.pet, undefined);
    assert.deepEqual(next.profile.repoIds, [repoId('me', 'me/app'), repoId('me', 'me/api')]);
    assert.equal(next.schema, 3);
  });

  test('describes the pet in the restore prompt', () => {
    assert.deepEqual([saveSummary(legacy()).name, saveSummary(legacy()).count], ['Cindle', 1]);
  });

  test('merging it into a collection that has the same species keeps one pet and does not count its XP again', () => {
    // The old save's pet was the only one: its XP is all the XP of the person, part of it earned by the koi here.
    const local = state({
      pets: { phoenix: { ...pet, earned: { '2026-11-03': 5 } }, koi: { ...koi, earned: { '2026-11-03': 15 } } },
    });
    const merged = mergeSave(local, legacy({ updatedAt: '2026-01-01T00:00:00Z' }));
    assert.deepEqual(Object.keys(merged.pets).sort(), ['koi', 'phoenix']);
    assert.deepEqual(merged.pets.phoenix.earned, { '2026-11-03': 5 });
    assert.deepEqual(merged.pets.koi.earned, { '2026-11-03': 15 });
  });
});

describe('remoteWins and the repos', () => {
  const remote = (updatedAt) => toSave(state({ profileUpdatedAt: updatedAt }));

  test('the remote profile wins when it is newer or when there are no local pets', () => {
    assert.equal(remoteWins(state({ profileUpdatedAt: '2026-11-01T00:00:00Z' }), remote('2026-11-05T00:00:00Z')), true);
    assert.equal(remoteWins(state({ pets: {}, activePet: null }), remote('2026-10-01T00:00:00Z')), true);
    assert.equal(
      remoteWins(state({ profileUpdatedAt: '2026-11-09T00:00:00Z' }), remote('2026-11-05T00:00:00Z')),
      false,
    );
  });

  test('a winning remote profile whose repos could not be found keeps the local repos', () => {
    const merged = mergeSave(state({ profileUpdatedAt: '2026-11-01T00:00:00Z' }), remote('2026-11-05T00:00:00Z'));
    assert.deepEqual(merged.repos, ['me/app']);
  });

  test('when no repo could be matched the remote profile still wins, with none (the user picks again)', () => {
    const merged = mergeSave(state({ profileUpdatedAt: '2026-11-01T00:00:00Z' }), remote('2026-11-05T00:00:00Z'), []);
    assert.deepEqual(merged.repos, []);
  });
});
