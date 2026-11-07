// The daily goal: how much XP makes a typical working day for this person (their weekly baseline over five working
// days). It is a nudge, not a duty: a weekend or a day of time off has no goal, and missing it costs nothing.
const { DAILY_GOAL } = require('./catalog');

/**
 * @param {{ baseline: number, xp: number, rest: boolean }} input  `xp`: earned today; `rest`: a weekend or time off
 * @returns {{ xp: number, goal: number | null, reached: boolean, rest: boolean }}  no goal (null) on a rest day
 */
function dailyGoalView({ baseline, xp, rest }) {
  if (rest) return { xp, goal: null, reached: false, rest: true };
  const goal = Math.max(1, Math.round(baseline / DAILY_GOAL.workdays));
  return { xp, goal, reached: xp >= goal, rest: false };
}

module.exports = { dailyGoalView };
