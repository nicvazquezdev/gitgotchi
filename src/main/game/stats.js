// Pure activity stats (XP per day and streaks): no I/O.
const { WEIGHTS, DAILY_CAPS, KINDS } = require('./catalog');
const { toDay, fromDay, addDays } = require('../dates');

/**
 * One ledger day: a count per kind, plus `prsXp` (the XP of the PRs opened that day, which depends on their size) and
 * `fastReviews` (how many of that day's reviews answered a request within the hour: a bonus on top of `reviews`).
 */
const emptyDay = () => ({ ...Object.fromEntries(KINDS.map((kind) => [kind, 0])), prsXp: 0, fastReviews: 0 });

/**
 * XP of one ledger day, per kind. Unknown (old) kinds are ignored.
 * Opened PRs carry their own XP (`prsXp`, depends on size); the other kinds are counts times a weight,
 * and a kind with a daily cap stops giving XP past it.
 */
const countXp = (d, kind) => Math.min(d[kind] || 0, DAILY_CAPS[kind] ?? Infinity) * WEIGHTS[kind];

const dayXpByKind = (d = {}) => ({
  prs: d.prsXp || 0,
  reviews: countXp(d, 'reviews') + (d.fastReviews || 0) * WEIGHTS.fastReviews, // the bonus is part of reviewing
  merges: countXp(d, 'merges'),
  commits: countXp(d, 'commits'),
  issues: countXp(d, 'issues'),
});

/** Total XP of one ledger day. */
const dayXp = (d) => Object.values(dayXpByKind(d)).reduce((a, b) => a + b, 0);

const isWeekend = (day) => [0, 6].includes(fromDay(day).getDay()); // Sunday or Saturday

const never = () => false;

/**
 * True when every day strictly between `from` and `to` is a rest day (a weekend day, or a day of time off, see
 * time-off.js): no working day was missed.
 */
function onlyRestBetween(from, to, isOff) {
  for (let day = addDays(from, 1); day < to; day = addDays(day, 1)) if (!isWeekend(day) && !isOff(day)) return false;
  return true;
}

/**
 * Streak length on each active day. A streak counts days with activity in a row. Weekends never break it: a
 * Saturday or Sunday without activity is skipped, one with activity counts. So are the days of time off (`isOff`).
 * Missing any other weekday starts over.
 * @param {string[]} activeDays  days with activity, oldest first
 * @param {(day: string) => boolean} [isOff]  whether a day was time off
 * @returns {Map<string, number>} day -> length of the streak on that day
 */
function streakLengths(activeDays, isOff = never) {
  const lengths = new Map();
  let prev = null;
  for (const day of activeDays) {
    lengths.set(day, prev && onlyRestBetween(prev, day, isOff) ? lengths.get(prev) + 1 : 1);
    prev = day;
  }
  return lengths;
}

/**
 * Streak and best streak.
 * Weekends and time off never break a streak (see `streakLengths`). Today without activity yet does not break it
 * either: counting starts from the last active day, as long as no working day went by in between.
 * @param {{ [day: string]: object }} days
 * @param {Date} now
 * @param {(day: string) => boolean} [isOff]  whether a day was time off
 * @returns {{ streak: number, bestStreak: number }}
 */
function stats(days, now = new Date(), isOff = never) {
  const today = toDay(now);
  const active = Object.keys(days)
    .filter((day) => day <= today && dayXp(days[day]) > 0)
    .sort();
  const lengths = streakLengths(active, isOff);

  const last = active.at(-1);
  const streak = last && onlyRestBetween(last, today, isOff) ? lengths.get(last) : 0;
  const bestStreak = Math.max(0, ...lengths.values());

  return { streak, bestStreak };
}

module.exports = { stats, streakLengths, isWeekend, emptyDay, dayXp, dayXpByKind };
