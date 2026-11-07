const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { commitKey, pendingPushes, mergeCommits, commitDays, pruneByDay } = require('../src/main/game/commits');
const { COMMIT_KEEP_DAYS } = require('../src/main/game/catalog');
const { toDay, addDays } = require('../src/main/dates');

const push = (id, repo = 'a/b') => ({ kind: 'pushes', id, repo, day: '2026-06-15', before: 'x', head: 'y' });

describe('commitKey', () => {
  test('ignores the sha, so a rebased commit keeps its identity', () => {
    const commit = { authorDate: '2026-06-15T10:00:00Z', message: 'Fix the bug\n\nLong body' };
    assert.equal(commitKey('A/B', commit), commitKey('a/b', { ...commit, sha: 'other' }));
  });

  test('only the subject counts, trimmed and limited in length', () => {
    const a = commitKey('a/b', { authorDate: 'd', message: '  Same subject \nbody one' });
    const b = commitKey('a/b', { authorDate: 'd', message: 'Same subject\nbody two' });
    assert.equal(a, b);
    assert.ok(commitKey('a/b', { authorDate: 'd', message: 'x'.repeat(500) }).length < 100);
  });

  test('different author dates or subjects are different commits', () => {
    const base = { authorDate: '2026-06-15T10:00:00Z', message: 'one' };
    assert.notEqual(commitKey('a/b', base), commitKey('a/b', { ...base, authorDate: '2026-06-15T10:00:01Z' }));
    assert.notEqual(commitKey('a/b', base), commitKey('a/b', { ...base, message: 'two' }));
  });
});

describe('pendingPushes', () => {
  test('keeps push events of the selected repos that were not resolved yet, in order', () => {
    const events = [push('3'), push('2', 'X/Y'), push('1', 'A/B'), { kind: 'reviews', repo: 'a/b', day: 'd' }];
    const pending = pendingPushes({ pushes: [{ id: '3' }] }, events, ['a/b']);
    assert.deepEqual(
      pending.map((p) => p.id),
      ['1'],
    );
  });

  test('works with an activity that never stored pushes', () => {
    assert.equal(pendingPushes({}, [push('1')], ['a/b']).length, 1);
  });
});

describe('mergeCommits and commitDays', () => {
  test('one record per key: the first one stays', () => {
    const merged = mergeCommits(
      [{ key: 'k', day: '2026-06-01' }],
      [
        { key: 'k', day: '2026-06-02' },
        { key: 'n', day: '2026-06-02' },
      ],
    );
    assert.deepEqual(merged, [
      { key: 'k', day: '2026-06-01' },
      { key: 'n', day: '2026-06-02' },
    ]);
  });

  test('counts commits per day', () => {
    const days = commitDays([
      { key: '1', day: '2026-06-01' },
      { key: '2', day: '2026-06-01' },
      { key: '3', day: '2026-06-02' },
    ]);
    assert.equal(days['2026-06-01'].commits, 2);
    assert.equal(days['2026-06-02'].commits, 1);
    assert.equal(days['2026-06-01'].reviews, 0);
  });
});

test('pruneByDay drops records older than the retention window', () => {
  const now = new Date(2026, 5, 15, 12);
  const today = toDay(now);
  const records = [
    { id: 'old', day: addDays(today, -(COMMIT_KEEP_DAYS + 1)) },
    { id: 'edge', day: addDays(today, -COMMIT_KEEP_DAYS) },
    { id: 'new', day: today },
  ];
  assert.deepEqual(
    pruneByDay(records, now).map((r) => r.id),
    ['edge', 'new'],
  );
});
