// Pure activity stats (XP per day, streaks and recent history): no I/O.
const { WEIGHTS, DAILY_CAPS, KINDS } = require('./catalog');
const { toDay, fromDay, addDays } = require('../dates');

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

const isWeekend = (day) => [0, 6].includes(fromDay(day).getDay()); // Sunday or Saturday

/** True when every day strictly between `from` and `to` is a weekend day: no working day was missed. */
function onlyWeekendsBetween(from, to) {
  for (let day = addDays(from, 1); day < to; day = addDays(day, 1)) if (!isWeekend(day)) return false;
  return true;
}

/**
 * Streak length on each active day. A streak counts days with activity in a row. Weekends never break it: a
 * Saturday or Sunday without activity is skipped, one with activity counts. Missing a weekday starts over.
 * @param {string[]} activeDays  days with activity, oldest first
 * @returns {Map<string, number>} day -> length of the streak on that day
 */
function streakLengths(activeDays) {
  const lengths = new Map();
  let prev = null;
  for (const day of activeDays) {
    lengths.set(day, prev && onlyWeekendsBetween(prev, day) ? lengths.get(prev) + 1 : 1);
    prev = day;
  }
  return lengths;
}

/**
 * Streak, best streak and last 7 days of XP.
 * Weekends never break a streak (see `streakLengths`). Today without activity yet does not break it either:
 * counting starts from the last active day, as long as no weekday went by in between.
 * @param {{ [day: string]: object }} days
 * @param {Date} now
 * @returns {{ streak: number, bestStreak: number, history: { day: string, score: number }[] }}
 */
function stats(days, now = new Date()) {
  const today = toDay(now);
  const active = Object.keys(days)
    .filter((day) => day <= today && dayXp(days[day]) > 0)
    .sort();
  const lengths = streakLengths(active);

  const last = active.at(-1);
  const streak = last && onlyWeekendsBetween(last, today) ? lengths.get(last) : 0;
  const bestStreak = Math.max(0, ...lengths.values());

  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const day = addDays(today, i - (HISTORY_DAYS - 1));
    return { day, score: dayXp(days[day]) };
  });

  return { streak, bestStreak, history };
}

module.exports = { stats, streakLengths, emptyDay, dayXp, dayXpByKind };
