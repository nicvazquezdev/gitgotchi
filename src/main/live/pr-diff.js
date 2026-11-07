// Pure diff between two snapshots of the user's recent pull requests.

// Tolerance for clock differences between this machine and GitHub.
const SKEW_MS = 60 * 1000;

const sameRepo = (a, b) => a.toLowerCase() === b.toLowerCase();

/**
 * `prs`: normalized nodes `{ id, state, reviewDecision, createdAt, mergedAt, repo }`; `repos`: selected `owner/repo`
 * names. Besides `prs` and `merges`, the delta carries two animation-only kinds (they give no XP): `approvals` and
 * `changesRequested`, when the review decision of an open PR just became APPROVED or CHANGES_REQUESTED.
 * `prev`: the previous snapshot or null. Returns the next snapshot and the new activity.
 * The first call (prev = null) only sets the baseline: no activity.
 */
function diffPullRequests(prev, prs, repos, now = Date.now()) {
  const selected = prs.filter((pr) => repos.some((r) => sameRepo(r, pr.repo)));
  const snapshot = {
    at: now,
    states: Object.fromEntries(selected.map((pr) => [pr.id, pr.state])),
    decisions: Object.fromEntries(selected.map((pr) => [pr.id, pr.reviewDecision ?? null])),
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

    // Feedback on an open PR we already knew: only a change of decision is news.
    const decision = pr.reviewDecision ?? null;
    if (pr.state === 'OPEN' && pr.id in (prev.decisions ?? {}) && prev.decisions[pr.id] !== decision) {
      if (decision === 'APPROVED') bump('approvals');
      else if (decision === 'CHANGES_REQUESTED') bump('changesRequested');
    }
  }
  return { snapshot, delta };
}

module.exports = { diffPullRequests };
