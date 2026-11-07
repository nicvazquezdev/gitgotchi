// Pure activity stats (XP per day, streaks and recent history): no I/O.
const { WEIGHTS, DAILY_CAPS, KINDS } = require('./catalog');
const { toDay, addDays } = require('../dates');

const HISTORY_DAYS = 7;

/** One ledger day: a count per kind, plus `prsXp` (the XP of the PRs opened that day, which depends on their size). */
const emptyDay = () => ({ ...Object.fromEntries(KINDS.map((kind) => [kind, 0])), prsXp: 0 });

/**
 * XP of one ledger day, per kind. Unknown (old) kinds are ignored.
 * Opened PRs carry their own XP (`prsXp`, depends on size); the other kinds are counts times a weight,
 * and a kind with a daily cap stops giving XP past it.
 */
const countXp = (d, kind) => Math.min(d[kind] || 0, DAILY_CAPS[kind] ?? Infinity) * WEIGHTS[kind];

const dayXpByKind = (d = {}) => ({
  prs: d.prsXp || 0,
  reviews: countXp(d, 'reviews'),
  merges: countXp(d, 'merges'),
  commits: countXp(d, 'commits'),
  issues: countXp(d, 'issues'),
});

/** Total XP of one ledger day. */
const dayXp = (d) => Object.values(dayXpByKind(d)).reduce((a, b) => a + b, 0);

/**
 * Streak, best streak and last 7 days of XP.
 * Today without activity yet does not break the streak: counting starts yesterday.
 * @param {{ [day: string]: object }} days
 * @param {Date} now
 * @returns {{ streak: number, bestStreak: number, history: { day: string, score: number }[] }}
 */
function stats(days, now = new Date()) {
  const today = toDay(now);
  const active = (day) => dayXp(days[day]) > 0;

  let streak = 0;
  for (let day = active(today) ? today : addDays(today, -1); active(day); day = addDays(day, -1)) streak++;

  let bestStreak = 0;
  let run = 0;
  let prev = null;
  for (const day of Object.keys(days).filter(active).sort()) {
    run = prev && addDays(prev, 1) === day ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = day;
  }

  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const day = addDays(today, i - (HISTORY_DAYS - 1));
    return { day, score: dayXp(days[day]) };
  });

  return { streak, bestStreak, history };
}

module.exports = { stats, emptyDay, dayXp, dayXpByKind };
