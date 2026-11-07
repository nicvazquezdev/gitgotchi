const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildDays, rankRepos, syncStartDay, mergeDays, computeStatus } = require('../src/main/game/engine');
const { WEIGHTS, SLEEP_HOURS } = require('../src/main/game/catalog');

const NOON = new Date(2026, 5, 15, 12);
const ev = (kind, repo, day) => ({ kind, repo, day });
const counts = (c = {}) => ({ ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0])), ...c });
const activity = (days = {}, lastSyncedAt = null) => ({ days, lastSyncedAt });
const pet = (bornAt = new Date(2026, 0, 1)) => ({ name: 'Pixel', species: 'blob', bornAt: bornAt.toISOString() });

describe('buildDays', () => {
  test('counts events per day and kind', () => {
    const events = [
      ev('pushes', 'a/b', '2026-06-01'),
      ev('pushes', 'a/b', '2026-06-01'),
      ev('prs', 'a/b', '2026-06-02'),
    ];
    assert.deepEqual(buildDays({ events, repos: ['a/b'] }), {
      '2026-06-01': counts({ pushes: 2 }),
      '2026-06-02': counts({ prs: 1 }),
    });
  });

  test('filters repos case-insensitively', () => {
    const events = [ev('pushes', 'Owner/Repo', '2026-06-01'), ev('pushes', 'other/x', '2026-06-01')];
    assert.deepEqual(buildDays({ events, repos: ['owner/REPO'] }), { '2026-06-01': counts({ pushes: 1 }) });
  });

  test('returns nothing when no repo is selected', () => {
    assert.deepEqual(buildDays({ events: [ev('pushes', 'a/b', '2026-06-01')], repos: [] }), {});
  });

  test('an unknown kind does not touch known counters', () => {
    // The client never emits unknown kinds; this documents the current behavior.
    const days = buildDays({ events: [ev('stars', 'a/b', '2026-06-01')], repos: ['a/b'] });
    assert.deepEqual(
      Object.keys(WEIGHTS).map((k) => days['2026-06-01'][k]),
      Object.keys(WEIGHTS).map(() => 0),
    );
  });
});

describe('rankRepos', () => {
  const repo = (fullName, pushedAt) => ({ fullName, private: false, pushedAt });

  test('dedupes case-insensitively and keeps accessible metadata', () => {
    const ranked = rankRepos([{ repo: 'A/B' }], [repo('a/b', '2026-01-01')]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].fullName, 'a/b');
    assert.equal(ranked[0].private, false);
  });

  test('orders by recent activity, then by pushedAt', () => {
    const accessible = [repo('old/x', '2026-01-01'), repo('new/x', '2026-05-01'), repo('busy/x', '2025-01-01')];
    const events = [{ repo: 'busy/x' }, { repo: 'busy/x' }, { repo: 'old/x' }];
    assert.deepEqual(
      rankRepos(events, accessible).map((r) => r.fullName),
      ['busy/x', 'old/x', 'new/x'],
    );
  });

  test('orders repos without activity by pushedAt, newest first', () => {
    const accessible = [repo('a/x', '2026-01-01'), repo('b/x', '2026-05-01')];
    assert.deepEqual(
      rankRepos([], accessible).map((r) => r.fullName),
      ['b/x', 'a/x'],
    );
  });

  test('includes event repos that are not accessible', () => {
    assert.deepEqual(
      rankRepos([{ repo: 'gone/x' }], []).map((r) => r.fullName),
      ['gone/x'],
    );
  });
});

describe('syncStartDay', () => {
  const synced = (...date) => ({ activity: activity({}, new Date(...date).toISOString()) });

  test('without prior sync starts 6 days ago', () => {
    assert.equal(syncStartDay({ activity: activity() }, NOON), '2026-06-09');
  });

  test('recent sync still covers the last week', () => {
    assert.equal(syncStartDay(synced(2026, 5, 15, 8), NOON), '2026-06-09');
  });

  test('old sync starts the day before the last sync', () => {
    assert.equal(syncStartDay(synced(2026, 5, 1, 8), NOON), '2026-05-31');
  });
});

describe('mergeDays', () => {
  test('keeps the max per day and kind', () => {
    const merged = mergeDays(
      { '2026-06-01': counts({ pushes: 5, prs: 1 }) },
      { '2026-06-01': counts({ pushes: 2, prs: 3 }) },
    );
    assert.deepEqual(merged['2026-06-01'], counts({ pushes: 5, prs: 3 }));
  });

  test('keeps old days missing from new data and adds new days', () => {
    const merged = mergeDays({ '2026-05-01': counts({ pushes: 4 }) }, { '2026-06-01': counts({ pushes: 1 }) });
    assert.deepEqual(Object.keys(merged).sort(), ['2026-05-01', '2026-06-01']);
    assert.equal(merged['2026-05-01'].pushes, 4);
  });

  test('does not mutate inputs', () => {
    const old = { '2026-06-01': counts({ pushes: 1 }) };
    mergeDays(old, { '2026-06-01': counts({ pushes: 9 }) });
    assert.equal(old['2026-06-01'].pushes, 1);
  });
});

describe('computeStatus', () => {
  test('returns null without a pet', () => {
    assert.equal(computeStatus({ pet: null, activity: activity() }, NOON), null);
  });

  test('xp counts only days since birth', () => {
    const days = {
      '2026-06-10': counts({ pushes: 1 }),
      '2026-06-14': counts({ pushes: 2 }),
      '2026-06-15': counts({ pushes: 3 }),
    };
    const status = computeStatus({ pet: pet(new Date(2026, 5, 14, 9)), activity: activity(days) }, NOON);
    assert.equal(status.xp, 5 * WEIGHTS.pushes);
  });

  test('week covers only the last 7 days', () => {
    const days = {
      '2026-06-08': counts({ pushes: 10 }), // 7 days ago: out
      '2026-06-09': counts({ pushes: 1 }), // 6 days ago: in
      '2026-06-15': counts({ pushes: 2 }),
      '2026-06-16': counts({ pushes: 50 }), // future: out
    };
    const status = computeStatus({ pet: pet(), activity: activity(days) }, NOON);
    assert.equal(status.week.pushes, 3);
    assert.equal(status.weekScore, 3 * WEIGHTS.pushes);
  });

  test('pet sleeps during sleep hours and not otherwise', () => {
    const at = (hour) => computeStatus({ pet: pet(), activity: activity() }, new Date(2026, 5, 15, hour));
    assert.equal(at(SLEEP_HOURS.from).mood, 'sleeping');
    assert.equal(at(SLEEP_HOURS.to - 1).mood, 'sleeping');
    assert.notEqual(at(SLEEP_HOURS.to).mood, 'sleeping');
    assert.notEqual(at(12).mood, 'sleeping');
  });

  test('exposes name and stage progress between 0 and 1', () => {
    const status = computeStatus({ pet: pet(), activity: activity({ '2026-06-15': counts({ pushes: 3 }) }) }, NOON);
    assert.ok(status.progress >= 0 && status.progress <= 1);
    assert.equal(status.name, 'Pixel');
  });
});
