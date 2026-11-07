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

  test('how long the user has been asked comes first: PRs with a known request date, oldest request first', () => {
    const queue = reviewQueue(
      [
        pr({ id: 'old-pr-new-ask', createdAt: hoursAgo(24 * 100), requestedAt: hoursAgo(5), via: 'a/ui' }),
        pr({ id: 'unknown-old', createdAt: hoursAgo(24 * 200) }),
        pr({ id: 'asked-long-ago', createdAt: hoursAgo(24 * 30), requestedAt: hoursAgo(24 * 20) }),
        pr({ id: 'unknown-new', createdAt: hoursAgo(24 * 2) }),
      ],
      ['a/b'],
      NOW,
    );
    assert.deepEqual(ids(queue), ['asked-long-ago', 'old-pr-new-ask', 'unknown-old', 'unknown-new']);
  });

  test('waitingDays counts from the request, not from the PR; it is null when the date is not known', () => {
    const [asked, unknown] = reviewQueue(
      [
        pr({ id: 'a', createdAt: hoursAgo(24 * 157), requestedAt: hoursAgo(24 * 52 + 3), via: 'a/code' }),
        pr({ id: 'b', createdAt: hoursAgo(24 * 9) }),
      ],
      ['a/b'],
      NOW,
    );
    assert.equal(asked.ageDays, 157);
    assert.equal(asked.waitingDays, 52);
    assert.equal(asked.via, 'a/code');
    assert.equal(asked.requestedAt, hoursAgo(24 * 52 + 3));
    assert.equal(unknown.waitingDays, null);
    assert.equal(unknown.via, null);
    assert.equal(unknown.requestedAt, null);
  });

  test('a request dated in the future (clock skew) counts as today', () => {
    const [entry] = reviewQueue([pr({ requestedAt: hoursAgo(-2) })], ['a/b'], NOW);
    assert.equal(entry.waitingDays, 0);
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
