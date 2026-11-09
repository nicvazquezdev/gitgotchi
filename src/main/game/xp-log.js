// The XP the person earned, day by day and why (pure, no I/O): what the XP log tab of the card lists.
const { WEIGHTS, DAILY_CAPS } = require('./catalog');
const { dayXp } = require('./stats');
const { toDay } = require('../dates');

const LOG_DAYS = 30; // days with XP that the log keeps, newest first

/**
 * The reasons behind one ledger day, in the order of the rules. A line is `{ kind, count, xp }`; `capped` is true when
 * the day went past what the kind gives XP for (commits). Together the lines add up to the XP of the day.
 */
function linesOf(day) {
  const count = (kind) => day[kind] || 0;
  const capped = (kind) => Math.min(count(kind), DAILY_CAPS[kind] ?? Infinity);
  const lines = [
    { kind: 'prs', count: count('prs'), xp: day.prsXp || 0 },
    { kind: 'merges', count: count('merges'), xp: capped('merges') * WEIGHTS.merges },
    { kind: 'reviews', count: count('reviews'), xp: capped('reviews') * WEIGHTS.reviews },
    { kind: 'fastReviews', count: count('fastReviews'), xp: count('fastReviews') * WEIGHTS.fastReviews },
    { kind: 'issues', count: count('issues'), xp: capped('issues') * WEIGHTS.issues },
    {
      kind: 'commits',
      count: count('commits'),
      xp: capped('commits') * WEIGHTS.commits,
      capped: count('commits') > capped('commits'),
    },
  ];
  return lines.filter((line) => line.xp > 0);
}

/**
 * @param {{ [day: string]: object }} days  the ledger (`activity.days`), already limited to the days that count
 * @returns {{ day: string, xp: number, lines: { kind: string, count: number, xp: number, capped?: boolean }[] }[]}
 *   the days with XP up to today, newest first
 */
function xpLog(days, now = new Date(), limit = LOG_DAYS) {
  const today = toDay(now);
  return Object.keys(days)
    .filter((day) => day <= today && dayXp(days[day]) > 0)
    .sort()
    .reverse()
    .slice(0, limit)
    .map((day) => ({ day, xp: dayXp(days[day]), lines: linesOf(days[day]) }));
}

module.exports = { xpLog, LOG_DAYS };
