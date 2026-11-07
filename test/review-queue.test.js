const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { reviewQueue } = require('../src/main/game/pull-requests');
const { WEIGHTS } = require('../src/main/game/catalog');

const NOW = new Date(2026, 5, 15, 12);
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
let nextId = 0;
const pr = (o = {}) => ({
  id: `pr${nextId++}`,
  number: 7,
  title: 'Add a thing',
  url: 'https://github.com/a/b/pull/7',
  repo: 'a/b',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  lines: 50,
  author: 'someone',
  createdAt: hoursAgo(1),
  mergedAt: null,
  ...o,
});
const ids = (list) => list.map((p) => p.id);

describe('reviewQueue', () => {
  test('oldest first, so the one that has waited longest is on top', () => {
    const queue = reviewQueue(
      [
        pr({ id: 'new', createdAt: hoursAgo(2) }),
        pr({ id: 'old', createdAt: hoursAgo(100) }),
        pr({ id: 'mid', createdAt: hoursAgo(30) }),
      ],
      ['a/b'],
      NOW,
    );
    assert.deepEqual(ids(queue), ['old', 'mid', 'new']);
  });

  test('only open, non-draft PRs of the selected repos (compared ignoring case)', () => {
    const queue = reviewQueue(
      [
        pr({ id: 'ok', repo: 'A/B' }),
        pr({ id: 'draft', isDraft: true }),
        pr({ id: 'merged', state: 'MERGED' }),
        pr({ id: 'other', repo: 'x/y' }),
      ],
      ['a/b'],
      NOW,
    );
    assert.deepEqual(ids(queue), ['ok']);
  });

  test('each entry has what the UI shows: size, age, author and the XP a review gives', () => {
    const [entry] = reviewQueue([pr({ lines: 600, createdAt: hoursAgo(50), author: 'ana' })], ['a/b'], NOW);
    assert.equal(entry.size, 'L');
    assert.equal(entry.ageDays, 2);
    assert.equal(entry.author, 'ana');
    assert.equal(entry.xp, WEIGHTS.reviews);
    assert.equal(entry.repo, 'b');
    assert.equal(entry.fullRepo, 'a/b');
    assert.equal(entry.url, 'https://github.com/a/b/pull/7');
  });

  test('a PR with no known author keeps a null author', () => {
    const [entry] = reviewQueue([pr({ author: null })], ['a/b'], NOW);
    assert.equal(entry.author, null);
  });

  test('nothing waiting, or no repo selected, gives an empty list', () => {
    assert.deepEqual(reviewQueue([], ['a/b'], NOW), []);
    assert.deepEqual(reviewQueue([pr()], [], NOW), []);
  });
});
