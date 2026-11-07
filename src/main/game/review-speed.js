// Pure rules for answering a review request fast: which requests are remembered, and which reviews came in time.
// The request dates come from the review queue (see github/review-requests.js), the reviews from the Events API
// (client.activity). The XP and the achievements are in stats.js and achievements.js.
const { FAST_REVIEW, REQUEST_KEEP_DAYS } = require('./catalog');
const { mergeCommits: mergeByKey, pruneByDay } = require('./commits'); // generic: records with a `key` / a `day`
const { toDay } = require('../dates');
const { emptyDay } = require('./stats');

const DAY_MS = 86400000;

/** Identity of a PR: 'owner/name' (lower case) and its number. */
const prKey = (repo, number) => `${repo.toLowerCase()}#${number}`;

/**
 * The requests the user has seen, with the date they were asked. A PR leaves the queue as soon as the user reviews
 * it, so the request has to be remembered before that to be compared with the review later. A PR asked again
 * keeps the new date. Requests whose date could not be proved are not kept (nothing to compare), and old ones are
 * dropped.
 * @param {{ repo: string, number: number, requestedAt: string }[]} stored
 * @param {{ repo: string, number: number, requestedAt?: string | null }[]} queue  the PRs waiting for the user's review
 */
function rememberRequests(stored, queue, now = new Date()) {
  const byPr = new Map(stored.map((request) => [prKey(request.repo, request.number), request]));
  for (const { repo, number, requestedAt } of queue) {
    if (!requestedAt) continue;
    const known = byPr.get(prKey(repo, number));
    if (!known || requestedAt > known.requestedAt) byPr.set(prKey(repo, number), { repo, number, requestedAt });
  }
  const oldest = new Date(now.getTime() - REQUEST_KEEP_DAYS * DAY_MS).toISOString();
  return [...byPr.values()].filter((request) => request.requestedAt >= oldest);
}

/**
 * The reviews submitted within FAST_REVIEW.minutes of the request, in the selected repos. A request counts once,
 * whatever the number of reviews after it (the key says which request it was), and a review from before the request
 * (the PR was asked again later) does not count.
 * @param {{ kind: string, repo: string, number?: number, at?: string }[]} events  from the Events API
 * @param {{ repo: string, number: number, requestedAt: string }[]} requests  see `rememberRequests`
 * @param {string[]} repos  the selected repos
 * @returns {{ key: string, day: string }[]}  `day`: the local day of the review
 */
function fastReviewsIn(events, requests, repos) {
  const selected = new Set(repos.map((repo) => repo.toLowerCase()));
  const byPr = new Map(requests.map((request) => [prKey(request.repo, request.number), request]));
  const found = new Map();
  for (const { kind, repo, number, at } of events) {
    if (kind !== 'reviews' || !number || !at || !selected.has(repo.toLowerCase())) continue;
    const request = byPr.get(prKey(repo, number));
    if (!request) continue;
    const waited = new Date(at) - new Date(request.requestedAt);
    if (!(waited >= 0 && waited <= FAST_REVIEW.minutes * 60000)) continue;
    const key = `${prKey(repo, number)}@${request.requestedAt}`;
    if (!found.has(key) || at < found.get(key).at) found.set(key, { key, at, day: toDay(at) });
  }
  return [...found.values()].map(({ key, day }) => ({ key, day }));
}

/** Stored records plus fresh ones, one per key. */
const mergeFastReviews = mergeByKey;

/** Ledger days the fast reviews account for: one count per record, on the day of the review. */
function fastReviewDays(records) {
  const days = {};
  for (const { day } of records) {
    days[day] ??= emptyDay();
    days[day].fastReviews += 1;
  }
  return days;
}

module.exports = { rememberRequests, fastReviewsIn, mergeFastReviews, fastReviewDays, pruneFastReviews: pruneByDay };
