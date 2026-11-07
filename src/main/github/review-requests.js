// Reading "who was asked to review this PR, and since when" from its GraphQL data (pure).
// GitHub only says who is asked right now (`reviewRequests`) and keeps the history as timeline events, which are noisy:
// bots and CODEOWNERS add and remove teams all the time, and a busy PR has hundreds of them. So the date is only given
// when it can be proved; otherwise it is null and the UI says so instead of guessing.

/** 'user:login' or 'team:org/slug' (lower case), null for anything else a review can be requested from (bots). */
function keyOf(reviewer) {
  if (reviewer?.__typename === 'Team' && reviewer.combinedSlug) return `team:${reviewer.combinedSlug.toLowerCase()}`;
  if (reviewer?.__typename === 'User' && reviewer.login) return `user:${reviewer.login.toLowerCase()}`;
  return null;
}

/**
 * When the user was asked, and through whom.
 * @param {{ pending?: object[], events?: { createdAt: string, requestedReviewer: object }[] }} pr
 *   `pending`: the reviewers asked now; `events`: the latest "review requested" events.
 * @param {{ login: string, teams: Iterable<string> }} me  the user and the teams they belong to ('org/slug')
 * @returns {{ requestedAt: string | null, via: string | null }}
 *   `via`: the team ('org/slug') the request came through, null when it was to the user directly.
 *   When both the user and their teams were asked, it is the one that has waited the longest.
 */
function requestInfo({ pending = [], events = [] }, { login, teams }) {
  const myTeams = new Set([...teams].map((slug) => slug.toLowerCase()));
  const me = `user:${login.toLowerCase()}`;
  const mine = pending
    .map(keyOf)
    .filter((key) => key === me || (key?.startsWith('team:') && myTeams.has(key.slice(5))));

  // The latest event of each: an older request may have been removed and made again.
  const latest = new Map();
  for (const { createdAt, requestedReviewer } of events) {
    const key = keyOf(requestedReviewer);
    if (mine.includes(key) && !(latest.get(key) >= createdAt)) latest.set(key, createdAt);
  }
  const [oldest] = [...latest].sort((a, b) => a[1].localeCompare(b[1]));
  const key = oldest ? oldest[0] : mine[0];
  return { requestedAt: oldest ? oldest[1] : null, via: key?.startsWith('team:') ? key.slice(5) : null };
}

module.exports = { requestInfo };
