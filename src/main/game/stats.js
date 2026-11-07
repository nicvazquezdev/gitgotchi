// Pure activity stats (XP per day, streaks and recent history): no I/O.
const { WEIGHTS } = require('./catalog');
const { toDay, addDays } = require('../dates');

const HISTORY_DAYS = 7;

/**
 * XP of one ledger day, per kind. Unknown (old) kinds are ignored.
 * Opened PRs carry their own XP (`prsXp`, depends on size); reviews and merges are counts.
 */
const dayXpByKind = (d = {}) => ({
  prs: d.prsXp || 0,
  reviews: (d.reviews || 0) * WEIGHTS.reviews,
  merges: (d.merges || 0) * WEIGHTS.merges,
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

module.exports = { stats, dayXp, dayXpByKind };
