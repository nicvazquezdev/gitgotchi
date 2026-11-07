// Pure rules for the user's pull requests: size, XP, the stored list and the UI views.
const { PR_SIZES, WEIGHTS, FAST_REVIEW, PR_KEEP_MERGED_DAYS } = require('./catalog');
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

/**
 * What a PR needs from its author, most urgent first: changes requested, failing checks, then (when nothing is wrong)
 * approved, checks still running, or simply waiting for a review.
 * @returns {{ kind: 'changes' | 'failing' | 'ready' | 'running' | 'review', label: string }}
 */
function statusOf({ reviewDecision, ci }) {
  if (reviewDecision === 'CHANGES_REQUESTED') return { kind: 'changes', label: 'Changes requested' };
  if (ci === 'FAILURE' || ci === 'ERROR') return { kind: 'failing', label: 'Checks failing' };
  if (reviewDecision === 'APPROVED') return { kind: 'ready', label: 'Ready to merge' };
  if (ci === 'PENDING' || ci === 'EXPECTED') return { kind: 'running', label: 'Checks running' };
  return { kind: 'review', label: 'Needs review' };
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
    sizeName: sizeOf(pr.lines).name,
    status: merged ? null : statusOf(pr),
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
 * What the user may want to be told about, one PR at a time (for a system notification): `kind` is
 * 'reviewRequested' | 'approved' | 'changesRequested' | 'checksFailed'. `pr`: a normalized PR (repo is 'owner/name')
 * or a queue entry (see `reviewQueue`, where it is `fullRepo`).
 */
function attentionOf(kind, pr) {
  const { id, title, number, url, author = null, via = null } = pr;
  return { id, kind, title, repo: pr.fullRepo ?? pr.repo, number, url, author, via };
}

/**
 * PRs waiting for the user's review, for the UI: only the selected repos (like everything else).
 * `xp` is what reviewing gives, and `fastXp` the bonus on top of it while `fastBonus` is true: the user was asked less
 * than FAST_REVIEW.minutes ago, so a review now still counts as fast (see review-speed.js). `prs`: normalized PRs with
 * an `author` login and, when known, `requestedAt` and `via` (client.reviewRequests).
 *
 * The wait that matters is since the user was asked (`waitingDays`), not since the PR was opened (`ageDays`): a PR
 * can be months old and have asked the user yesterday. It is null when the request date could not be proved, and
 * those PRs come after the ones that are known, by the age of the PR, so a guess never ranks as urgent.
 */
function reviewQueue(prs, repos, now = new Date()) {
  const selected = new Set(repos.map((r) => r.toLowerCase()));
  return prs
    .filter((pr) => pr.state === 'OPEN' && !pr.isDraft && selected.has(pr.repo.toLowerCase()))
    .sort((a, b) => {
      if (Boolean(a.requestedAt) !== Boolean(b.requestedAt)) return a.requestedAt ? -1 : 1;
      return (a.requestedAt ?? a.createdAt).localeCompare(b.requestedAt ?? b.createdAt);
    })
    .map((pr) => ({
      ...toView(pr, now),
      author: pr.author,
      xp: WEIGHTS.reviews,
      fastXp: WEIGHTS.fastReviews,
      fastBonus:
        Boolean(pr.requestedAt) && now.getTime() - new Date(pr.requestedAt).getTime() <= FAST_REVIEW.minutes * 60000,
      requestedAt: pr.requestedAt ?? null,
      via: pr.via ?? null,
      waitingDays: pr.requestedAt
        ? Math.max(0, Math.floor((now.getTime() - new Date(pr.requestedAt).getTime()) / DAY_MS))
        : null,
    }));
}

module.exports = {
  sizeOf,
  statusOf,
  openXp,
  mergePullRequests,
  prunePullRequests,
  pullRequestDays,
  classify,
  attentionOf,
  reviewQueue,
};
