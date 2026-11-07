// Pure rules for the user's pull requests: size, XP, the stored list and the UI views.
const { PR_SIZES, WEIGHTS, PR_KEEP_MERGED_DAYS } = require('./catalog');
const { toDay } = require('../dates');
const { emptyDay } = require('./stats');

const DAY_MS = 86400000;

/** Size bucket of a PR from its changed lines. */
const sizeOf = (lines) => PR_SIZES.find((s) => lines < s.maxLines);

/** XP for opening a PR of that many changed lines. */
const openXp = (lines) => sizeOf(lines).xp;

/** Compact PR record kept in the state, from a normalized GitHub node (see client.pullRequests). */
const toRecord = ({ id, number, title, url, repo, state, isDraft, reviewDecision, lines, createdAt, mergedAt }) => ({
  id,
  number,
  title,
  url,
  repo,
  state,
  isDraft,
  reviewDecision,
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

/** Short repo name: 'webflow/app-web' -> 'app-web'. */
const shortRepo = (fullName) => fullName.split('/').pop();

/** UI shape of a PR. `xp`: what it gave when opened, or the merge bonus for a merged PR. */
function toView(pr, now) {
  const merged = pr.state === 'MERGED';
  return {
    id: pr.id,
    title: pr.title,
    number: pr.number,
    repo: shortRepo(pr.repo),
    fullRepo: pr.repo,
    url: pr.url,
    size: sizeOf(pr.lines).id,
    xp: merged ? WEIGHTS.merges : openXp(pr.lines),
    ageDays: Math.max(0, Math.floor((now.getTime() - new Date(pr.createdAt).getTime()) / DAY_MS)),
    createdAt: pr.createdAt,
    mergedAt: pr.mergedAt,
  };
}

/**
 * Splits the stored PRs for the UI.
 * waiting: open, not draft, not approved (oldest first). approved: open and approved (oldest first).
 * mergedToday: merged since local midnight (newest first).
 */
function classify(prs, now = new Date()) {
  const today = toDay(now);
  const byAge = (a, b) => a.createdAt.localeCompare(b.createdAt);
  const open = prs.filter((pr) => pr.state === 'OPEN' && !pr.isDraft).sort(byAge);
  const isApproved = (pr) => pr.reviewDecision === 'APPROVED';
  const view = (pr) => toView(pr, now);
  return {
    waiting: open.filter((pr) => !isApproved(pr)).map(view),
    approved: open.filter(isApproved).map(view),
    mergedToday: prs
      .filter((pr) => pr.state === 'MERGED' && toDay(pr.mergedAt) === today)
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
      .map(view),
  };
}

/**
 * PRs waiting for the user's review, for the UI: only the selected repos (like everything else), oldest first.
 * `xp` is what reviewing gives. `prs`: normalized PRs with an `author` login (client.reviewRequests).
 */
function reviewQueue(prs, repos, now = new Date()) {
  const selected = new Set(repos.map((r) => r.toLowerCase()));
  return prs
    .filter((pr) => pr.state === 'OPEN' && !pr.isDraft && selected.has(pr.repo.toLowerCase()))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((pr) => ({ ...toView(pr, now), author: pr.author, xp: WEIGHTS.reviews }));
}

module.exports = {
  sizeOf,
  openXp,
  mergePullRequests,
  prunePullRequests,
  pullRequestDays,
  classify,
  reviewQueue,
};
