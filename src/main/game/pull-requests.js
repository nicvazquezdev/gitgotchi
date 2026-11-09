// Pure rules for the user's pull requests: size, XP and the stored list.
const { PR_SIZES, PR_KEEP_MERGED_DAYS } = require('./catalog');
const { toDay } = require('../dates');
const { emptyDay } = require('./stats');

const DAY_MS = 86400000;

/** Size bucket of a PR from its changed lines. */
const sizeOf = (lines) => PR_SIZES.find((s) => lines < s.maxLines);

/** XP for opening a PR of that many changed lines. */
const openXp = (lines) => sizeOf(lines).xp;

/** Compact PR record kept in the state, from a normalized GitHub node (see client.pullRequests). */
const toRecord = ({
  id,
  number,
  title,
  url,
  repo,
  state,
  isDraft,
  reviewDecision,
  ci,
  mergeable,
  lines,
  createdAt,
  mergedAt,
}) => ({
  id,
  number,
  title,
  url,
  repo,
  state,
  isDraft,
  reviewDecision,
  ci: ci ?? null,
  mergeable: mergeable ?? null,
  lines,
  createdAt,
  mergedAt,
});

/** Stored list updated with fresh PRs (by id). Only PRs in `repos` are kept; closed-unmerged ones are dropped. */
function mergePullRequests(stored, fresh, repos) {
  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const byId = new Map(stored.map((pr) => [pr.id, pr]));
  for (const pr of fresh) if (selected.has(pr.repo.toLowerCase())) byId.set(pr.id, toRecord(pr));
  return [...byId.values()].filter((pr) => pr.state === 'OPEN' || pr.state === 'MERGED');
}

/** Open PRs and PRs merged within PR_KEEP_MERGED_DAYS: older merges live on in the day ledger only. */
function prunePullRequests(prs, now = new Date()) {
  const oldest = now.getTime() - PR_KEEP_MERGED_DAYS * DAY_MS;
  return prs.filter((pr) => pr.state === 'OPEN' || new Date(pr.mergedAt).getTime() >= oldest);
}

/** Ledger days the PRs account for: `prs` + `prsXp` on the day each was opened, `merges` on the day it was merged. */
function pullRequestDays(prs) {
  const days = {};
  const day = (d) => (days[d] ??= emptyDay());
  for (const pr of prs) {
    const opened = day(toDay(pr.createdAt));
    opened.prs += 1;
    opened.prsXp += openXp(pr.lines);
    if (pr.state === 'MERGED') day(toDay(pr.mergedAt)).merges += 1;
  }
  return days;
}

module.exports = {
  sizeOf,
  openXp,
  mergePullRequests,
  prunePullRequests,
  pullRequestDays,
};
