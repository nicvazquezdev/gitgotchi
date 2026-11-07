// Small text helpers shared by the dropdown, the popover and the pet's bubble.

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Total XP of a list of PRs. */
export const totalXp = (prs) => prs.reduce((sum, pr) => sum + (pr.xp ?? 0), 0);

/** Age in days of the longest-waiting PR (0 for an empty list). */
export const oldestDays = (prs) => Math.max(0, ...prs.map((pr) => pr.ageDays ?? 0));

/**
 * How many days the longest-waiting review request has been waiting since the user was asked, or null when none of
 * the requests has a known date (see reviewQueue in game/pull-requests.js).
 */
export function oldestWaitingDays(queue) {
  const known = queue.map((pr) => pr.waitingDays).filter((days) => days != null);
  return known.length ? Math.max(...known) : null;
}

/** "just now", "2 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(date, now = Date.now()) {
  const minutes = Math.floor((now - new Date(date).getTime()) / 60000);
  if (!(minutes >= 1)) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return `${plural(Math.floor(hours / 24), 'day')} ago`;
}
