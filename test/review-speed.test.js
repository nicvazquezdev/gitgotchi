const test = require('node:test');
const assert = require('node:assert/strict');
const { rememberRequests, fastReviewsIn, mergeFastReviews, fastReviewDays } = require('../src/main/game/review-speed');
const { dayXp, emptyDay } = require('../src/main/game/stats');
const { WEIGHTS, FAST_REVIEW, REQUEST_KEEP_DAYS } = require('../src/main/game/catalog');
const { achievementProgress } = require('../src/main/game/achievements');
const { toDay } = require('../src/main/dates');

const NOW = new Date('2026-06-15T12:00:00Z');
const at = (minutesAgo) => new Date(NOW.getTime() - minutesAgo * 60000).toISOString();
const request = (number, requestedAt, repo = 'acme/web') => ({ repo, number, requestedAt });
const review = (number, submittedAt, repo = 'acme/web') => ({
  kind: 'reviews',
  repo,
  day: toDay(submittedAt),
  number,
  at: submittedAt,
});

test('requests are remembered with the date the user was asked, one per PR; a new request replaces the old date', () => {
  const stored = rememberRequests([], [request(1, at(30)), request(2, at(20))], NOW);
  assert.deepEqual(
    stored.map((r) => [r.number, r.requestedAt]),
    [
      [1, at(30)],
      [2, at(20)],
    ],
  );
  // the same PR again, with the same date: nothing changes; asked again later: the new date
  assert.deepEqual(rememberRequests(stored, [request(1, at(30))], NOW), stored);
  const again = rememberRequests(stored, [request(1, at(5))], NOW);
  assert.equal(again.find((r) => r.number === 1).requestedAt, at(5));
  // an older date for the same PR does not take the place of the newer one
  assert.equal(rememberRequests(again, [request(1, at(60))], NOW).find((r) => r.number === 1).requestedAt, at(5));
});

test('a request without a provable date is not remembered, and old ones are dropped', () => {
  assert.deepEqual(rememberRequests([], [{ repo: 'acme/web', number: 1, requestedAt: null }], NOW), []);
  const old = new Date(NOW.getTime() - (REQUEST_KEEP_DAYS + 1) * 86400000).toISOString();
  const kept = rememberRequests([request(1, old), request(2, at(10))], [], NOW);
  assert.deepEqual(
    kept.map((r) => r.number),
    [2],
  );
});

test('a review within the hour of the request is fast; later, or before the request, it is not', () => {
  const requests = [request(1, at(90)), request(2, at(90)), request(3, at(90))];
  const events = [
    review(1, at(90 - FAST_REVIEW.minutes)), // exactly one hour after: still fast
    review(2, at(90 - FAST_REVIEW.minutes - 1)), // a minute too late
    review(3, at(100)), // before the request (it was asked again afterwards)
  ];
  const fast = fastReviewsIn(events, requests, ['acme/web']);
  assert.deepEqual(
    fast.map((f) => f.key),
    [`acme/web#1@${at(90)}`],
  );
  assert.equal(fast[0].day, toDay(at(90 - FAST_REVIEW.minutes)));
});

test('a request counts once, however many reviews follow it, and the first review gives the day', () => {
  const requests = [request(7, at(50))];
  const events = [review(7, at(10)), review(7, at(40)), review(7, at(20))];
  const fast = fastReviewsIn(events, requests, ['acme/web']);
  assert.equal(fast.length, 1);
  assert.equal(fast[0].day, toDay(at(40)));
});

test('only reviews with a PR number and time, in the selected repos, on a request that was remembered', () => {
  const requests = [request(1, at(30), 'acme/web'), request(2, at(30), 'acme/other')];
  const events = [
    review(1, at(10), 'ACME/WEB'), // case does not matter
    review(2, at(10), 'acme/other'), // repo not selected
    review(3, at(10), 'acme/web'), // nobody asked: a voluntary review
    { kind: 'reviews', repo: 'acme/web', day: toDay(at(10)) }, // an old-shaped event, without number or time
    { kind: 'issues', repo: 'acme/web', day: toDay(at(10)), number: 1, at: at(10) },
  ];
  const fast = fastReviewsIn(events, requests, ['acme/web']);
  assert.deepEqual(
    fast.map((f) => f.key),
    [`acme/web#1@${at(30)}`],
  );
});

test('fast reviews are stored once (by request) and counted per day in the ledger', () => {
  const found = [
    { key: 'a#1@x', day: '2026-06-14' },
    { key: 'a#2@y', day: '2026-06-14' },
    { key: 'a#3@z', day: '2026-06-15' },
  ];
  assert.equal(mergeFastReviews(found, [{ key: 'a#1@x', day: '2026-06-14' }]).length, 3);
  const days = fastReviewDays(found);
  assert.equal(days['2026-06-14'].fastReviews, 2);
  assert.equal(days['2026-06-15'].fastReviews, 1);
  assert.equal(days['2026-06-15'].reviews, 0); // they are a bonus: the review itself is counted from the events
});

test('a fast review is worth the bonus on top of the review, as part of reviewing', () => {
  const day = { ...emptyDay(), reviews: 3, fastReviews: 2 };
  assert.equal(dayXp(day), 3 * WEIGHTS.reviews + 2 * WEIGHTS.fastReviews);
  assert.equal(dayXp({ ...emptyDay(), reviews: 3 }), 3 * WEIGHTS.reviews);
  assert.equal(dayXp({ prs: 0, reviews: 1 }), WEIGHTS.reviews); // old-shaped days have no fastReviews
});

test('the achievements: one fast review, then ten', () => {
  const days = (n) => ({ '2026-06-10': { ...emptyDay(), reviews: n, fastReviews: n } });
  const progress = (n) => Object.fromEntries(achievementProgress({ days: days(n) }).map((a) => [a.id, a]));
  assert.equal(progress(0)['fast-review'].unlockedAt, null);
  assert.equal(progress(1)['fast-review'].unlockedAt, '2026-06-10');
  assert.equal(progress(1)['fast-review-10'].unlockedAt, null);
  assert.deepEqual([progress(4)['fast-review-10'].value, progress(4)['fast-review-10'].unit], [4, 'fast reviews']);
  assert.equal(progress(10)['fast-review-10'].unlockedAt, '2026-06-10');
});
