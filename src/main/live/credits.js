// "Already celebrated" credits: live sources react first, the slower Events diff must not react again.
// A credit is `{ kind, at }`. Pure functions: the caller keeps the array.

const isLive = (credit, now, ttlMs) => now - credit.at < ttlMs;

/** Credits plus one per unit of `delta` (e.g. `{ merges: 1 }`), without expired ones. */
function addCredits(credits, delta, now, ttlMs) {
  const added = Object.entries(delta).flatMap(([kind, n]) => Array.from({ length: n }, () => ({ kind, at: now })));
  return [...credits.filter((c) => isLive(c, now, ttlMs)), ...added];
}

/** Takes credits off `delta`. Returns the remaining `delta` (no zero entries) and the unused credits. */
function subtractCredits(credits, delta, now, ttlMs) {
  const unused = credits.filter((c) => isLive(c, now, ttlMs));
  const remaining = {};
  for (const [kind, n] of Object.entries(delta)) {
    let left = n;
    for (let i = 0; left > 0 && i < unused.length;) {
      if (unused[i].kind === kind) {
        unused.splice(i, 1);
        left--;
      } else i++;
    }
    if (left > 0) remaining[kind] = left;
  }
  return { delta: remaining, credits: unused };
}

module.exports = { addCredits, subtractCredits };
