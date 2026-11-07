// Pure rules for time off (a vacation, a holiday): days that are neither activity nor a missed day. A streak is not
// broken by them (like weekends, see stats.js), the pet does not get anxious, and the daily goal and reminders rest.
// A range is `{ from, to }`, both 'YYYY-MM-DD' and inclusive. `to` is null while the person is away with no set return.
const { toDay, fromDay, addDays } = require('../dates');

/** A real calendar day written as 'YYYY-MM-DD'. */
const isDay = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toDay(fromDay(value)) === value;

/** Is `day` inside one of the ranges? A range with no end lasts until `today`. */
const isOffDay = (ranges, day, today) => ranges.some((r) => day >= r.from && day <= (r.to ?? today));

/** The range that is on today, or null. */
const activeRange = (ranges, today) => ranges.find((r) => r.from <= today && (r.to ?? today) >= today) ?? null;

/** Starts time off today, with no set return. Nothing changes if it is already on. */
function startTimeOff(ranges, today) {
  return activeRange(ranges, today) ? ranges : [...ranges, { from: today, to: null }];
}

/**
 * Ends the time off that is on: the person is back today, so it lasted until yesterday. A range that started today
 * would be empty, so it goes away.
 */
function endTimeOff(ranges, today) {
  const active = activeRange(ranges, today);
  if (!active) return ranges;
  const last = addDays(today, -1);
  return ranges.flatMap((r) => (r !== active ? [r] : r.from > last ? [] : [{ from: r.from, to: last }]));
}

/**
 * Sets the day the person is back (the first day that counts again), or clears it with null. It has to be a real day
 * after today; anything else changes nothing.
 */
function setReturn(ranges, today, backOn) {
  const active = activeRange(ranges, today);
  if (!active) return ranges;
  if (backOn !== null && !(isDay(backOn) && backOn > today)) return ranges;
  const to = backOn === null ? null : addDays(backOn, -1);
  return ranges.map((r) => (r === active ? { ...r, to } : r));
}

/** What the UI needs: whether today is off, since when, and the day the person is back (null: not set). */
function timeOffView(ranges, today) {
  const active = activeRange(ranges, today);
  return { active: Boolean(active), since: active?.from ?? null, backOn: active?.to ? addDays(active.to, 1) : null };
}

/**
 * The ranges of two computers: one per start day. When both know the end, the earlier one stays; when only one does,
 * that one (a time off ended on a computer must not come back open from the other).
 */
function mergeTimeOff(a = [], b = []) {
  const byFrom = new Map();
  for (const range of [...a, ...b]) {
    const known = byFrom.get(range.from);
    if (!known) byFrom.set(range.from, { ...range });
    else if (known.to === null) known.to = range.to;
    else if (range.to !== null && range.to < known.to) known.to = range.to;
  }
  return [...byFrom.values()].sort((x, y) => x.from.localeCompare(y.from));
}

module.exports = { isDay, isOffDay, activeRange, startTimeOff, endTimeOff, setReturn, timeOffView, mergeTimeOff };
