// Pause: one idea for "leave me alone for a while", with three lengths: an hour, until tomorrow, or a vacation.
// - An hour is a moment (`pausedUntil`, a time in ms): it only quiets the app (no bubbles, notifications or popups;
//   the pet just idles). It touches no day.
// - Until tomorrow and a vacation are days of time off (see time-off.js): they quiet the app too, and no streak is
//   broken by them.
// Time off outranks the hour when both are on: it is the longer one.
const { startTimeOff, setReturn, timeOffView } = require('./time-off');
const { addDays } = require('../dates');

const HOUR_MS = 60 * 60 * 1000;

/**
 * What is paused now.
 * @param {{ pausedUntil?: number | null, timeOff?: object[], today: string, now: number }} input  `now` in ms
 * @returns {{ active: boolean, until: number | null, backOn: string | null, since: string | null }}
 *   `until`: the time an hour pause ends; `backOn`: the first day that counts again after time off (null: not set);
 *   `since`: the day the time off began
 */
function pauseView({ pausedUntil = null, timeOff = [], today, now }) {
  const off = timeOffView(timeOff, today);
  if (off.active) return { active: true, until: null, backOn: off.backOn, since: off.since };
  if (pausedUntil !== null && now < pausedUntil) return { active: true, until: pausedUntil, backOn: null, since: null };
  return { active: false, until: null, backOn: null, since: null };
}

/** The time off of "until tomorrow": it starts today and the person is back tomorrow. */
const untilTomorrow = (ranges, today) => setReturn(startTimeOff(ranges, today), today, addDays(today, 1));

module.exports = { HOUR_MS, pauseView, untilTomorrow };
