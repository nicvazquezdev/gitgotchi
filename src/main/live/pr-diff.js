// Pure diff between two snapshots of the user's recent pull requests.

// Tolerance for clock differences between this machine and GitHub.
const SKEW_MS = 60 * 1000;

const sameRepo = (a, b) => a.toLowerCase() === b.toLowerCase();

/** The checks states that mean the PR is red (see `ci` in the normalized PRs). */
const FAILED = new Set(['FAILURE', 'ERROR']);

/**
 * Does the PR have merge conflicts? GitHub answers UNKNOWN for a while after the base or the PR moves, and that
 * says nothing: it keeps what it was (`before`), so a PR does not turn conflicted and clean and conflicted again.
 */
const conflicts = (pr, before) => (pr.mergeable === 'UNKNOWN' ? before === true : pr.mergeable === 'CONFLICTING');

/** Approved with every check green and no conflicts: nothing is left but to merge it. (No checks is not "green".) */
const isReady = (pr, conflicting) => pr.reviewDecision === 'APPROVED' && pr.ci === 'SUCCESS' && !conflicting;

/**
 * `prs`: normalized nodes `{ id, state, reviewDecision, ci, createdAt, mergedAt, repo }`; `repos`: selected
 * `owner/repo` names. Besides `prs` and `merges`, the delta carries three animation-only kinds (they give no XP):
 * `approvals` and `changesRequested`, when the review decision of an open PR just became APPROVED or CHANGES_REQUESTED,
 * `checksFailed`, when its checks just went red, `mergeConflicts`, when it just got conflicts, and `readyToMerge`, when
 * it just became approved with green checks and no conflicts (by an approval, by the checks turning green after one,
 * or by the conflicts being fixed).
 * `prev`: the previous snapshot or null. Returns the next snapshot and the new activity. A PR the app already knew is
 * needed to tell a change from something that was already so; checks count when they go from not failing to failing.
 * The first call (prev = null) only sets the baseline: no activity.
 */
function diffPullRequests(prev, prs, repos, now = Date.now()) {
  const selected = prs.filter((pr) => repos.some((r) => sameRepo(r, pr.repo)));
  const conflicting = Object.fromEntries(selected.map((pr) => [pr.id, conflicts(pr, prev?.conflicting?.[pr.id])]));
  const snapshot = {
    at: now,
    states: Object.fromEntries(selected.map((pr) => [pr.id, pr.state])),
    decisions: Object.fromEntries(selected.map((pr) => [pr.id, pr.reviewDecision ?? null])),
    checks: Object.fromEntries(selected.map((pr) => [pr.id, pr.ci ?? null])),
    conflicting,
    ready: Object.fromEntries(selected.map((pr) => [pr.id, isReady(pr, conflicting[pr.id])])),
  };
  const delta = {};
  if (!prev) return { snapshot, delta };

  const since = prev.at - SKEW_MS;
  const bump = (kind) => (delta[kind] = (delta[kind] || 0) + 1);
  for (const pr of selected) {
    const before = prev.states[pr.id];
    if (pr.state === 'MERGED' && before !== 'MERGED') {
      // Unknown before: only a merge since the last check counts, not an old PR entering the window.
      if (before === 'OPEN' || new Date(pr.mergedAt) >= since) bump('merges');
    } else if (pr.state === 'OPEN' && !before && new Date(pr.createdAt) >= since) bump('prs');

    // Feedback on an open PR we already knew: only a change is news.
    const decision = pr.reviewDecision ?? null;
    const known = pr.state === 'OPEN' && pr.id in (prev.decisions ?? {}) && pr.id in (prev.checks ?? {});
    const ready = known && snapshot.ready[pr.id] && !prev.ready?.[pr.id];
    if (known && prev.decisions[pr.id] !== decision) {
      if (decision === 'APPROVED') bump('approvals');
      else if (decision === 'CHANGES_REQUESTED') bump('changesRequested');
    }
    if (ready) bump('readyToMerge');
    if (known && FAILED.has(pr.ci) && !FAILED.has(prev.checks[pr.id])) bump('checksFailed');
    if (known && conflicting[pr.id] && !prev.conflicting?.[pr.id]) bump('mergeConflicts');
  }
  return { snapshot, delta };
}

module.exports = { diffPullRequests };
