// Pure diff between two snapshots of the user's recent pull requests.

// Tolerance for clock differences between this machine and GitHub.
const SKEW_MS = 60 * 1000;

const sameRepo = (a, b) => a.toLowerCase() === b.toLowerCase();

/** The checks states that mean the PR is red (see `ci` in the normalized PRs). */
const FAILED = new Set(['FAILURE', 'ERROR']);

/**
 * `prs`: normalized nodes `{ id, state, reviewDecision, ci, createdAt, mergedAt, repo }`; `repos`: selected
 * `owner/repo` names. Besides `prs` and `merges`, the delta carries two animation-only kinds (they give no XP):
 * `approvals` and `changesRequested`, when the review decision of an open PR just became APPROVED or CHANGES_REQUESTED.
 * `prev`: the previous snapshot or null. Returns the next snapshot, the new activity, and the `moments`: what just
 * happened to one of the user's open PRs that they may want to hear about, with the PR:
 * `[{ kind: 'approved' | 'changesRequested' | 'checksFailed', pr }]`. A PR the app already knew is needed to tell a
 * change from something that was already so; checks count when they go from not failing to failing.
 * The first call (prev = null) only sets the baseline: no activity.
 */
function diffPullRequests(prev, prs, repos, now = Date.now()) {
  const selected = prs.filter((pr) => repos.some((r) => sameRepo(r, pr.repo)));
  const snapshot = {
    at: now,
    states: Object.fromEntries(selected.map((pr) => [pr.id, pr.state])),
    decisions: Object.fromEntries(selected.map((pr) => [pr.id, pr.reviewDecision ?? null])),
    checks: Object.fromEntries(selected.map((pr) => [pr.id, pr.ci ?? null])),
  };
  const delta = {};
  const moments = [];
  if (!prev) return { snapshot, delta, moments };

  const since = prev.at - SKEW_MS;
  const bump = (kind) => (delta[kind] = (delta[kind] || 0) + 1);
  for (const pr of selected) {
    const before = prev.states[pr.id];
    if (pr.state === 'MERGED' && before !== 'MERGED') {
      // Unknown before: only a merge since the last check counts, not an old PR entering the window.
      if (before === 'OPEN' || new Date(pr.mergedAt) >= since) bump('merges');
    } else if (pr.state === 'OPEN' && !before && new Date(pr.createdAt) >= since) bump('prs');

    // Feedback on an open PR we already knew: only a change of decision is news.
    const decision = pr.reviewDecision ?? null;
    if (pr.state === 'OPEN' && pr.id in (prev.decisions ?? {}) && prev.decisions[pr.id] !== decision) {
      if (decision === 'APPROVED') {
        bump('approvals');
        moments.push({ kind: 'approved', pr });
      } else if (decision === 'CHANGES_REQUESTED') {
        bump('changesRequested');
        moments.push({ kind: 'changesRequested', pr });
      }
    }
    if (pr.state === 'OPEN' && pr.id in (prev.checks ?? {}) && FAILED.has(pr.ci) && !FAILED.has(prev.checks[pr.id])) {
      moments.push({ kind: 'checksFailed', pr });
    }
  }
  return { snapshot, delta, moments };
}

module.exports = { diffPullRequests };
