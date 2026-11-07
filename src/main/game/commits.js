// Pure rules for the commits the user pushed: which pushes still need a lookup, the stored records
// and the day ledger. XP per day lives in stats.js; fetching lives in github/client.js.
const { COMMIT_KEEP_DAYS } = require('./catalog');
const { toDay, addDays } = require('../dates');
const { emptyDay } = require('./stats');

/**
 * Identity of a commit that survives a rebase: same repo, author date and subject, whatever the new sha.
 * @param {string} repo  'owner/name'
 * @param {{ authorDate: string, message: string }} commit
 */
const commitKey = (repo, { authorDate, message }) =>
  `${repo.toLowerCase()}|${authorDate}|${String(message).split('\n')[0].trim().slice(0, 72)}`;

/**
 * Push events (client.activity) in the selected repos that were not resolved yet, in the order given.
 * @param {{ pushes?: { id: string }[] }} activity
 * @param {{ kind: string, id: string, repo: string }[]} events
 * @param {string[]} repos
 */
function pendingPushes(activity, events, repos) {
  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const seen = new Set((activity.pushes ?? []).map((push) => push.id));
  return events.filter((e) => e.kind === 'pushes' && selected.has(e.repo.toLowerCase()) && !seen.has(e.id));
}

/** Stored records plus fresh ones, one per key (the first one stays). */
function mergeCommits(stored, fresh) {
  const byKey = new Map();
  for (const commit of [...stored, ...fresh]) if (!byKey.has(commit.key)) byKey.set(commit.key, commit);
  return [...byKey.values()];
}

/** Ledger days the commits account for: one count per record, on the day of the push that carried it. */
function commitDays(commits) {
  const days = {};
  for (const { day } of commits) {
    days[day] ??= emptyDay();
    days[day].commits += 1;
  }
  return days;
}

/** Drops records (`{ day }`) older than COMMIT_KEEP_DAYS. Their XP stays in the ledger. */
function pruneByDay(records, now = new Date()) {
  const oldest = addDays(toDay(now), -COMMIT_KEEP_DAYS);
  return records.filter((record) => record.day >= oldest);
}

module.exports = { commitKey, pendingPushes, mergeCommits, commitDays, pruneByDay };
