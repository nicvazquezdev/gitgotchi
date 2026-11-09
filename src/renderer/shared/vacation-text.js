// How a vacation is said to the person (pure): "until Jun 19", "until tomorrow" or "until you are back".
// `pause` is the one of the status: `{ active, backOn }` (see main/game/time-off.js).
import { dayLabel } from './format.js';

/** 'YYYY-MM-DD' of the day after `now`, in the person's day. */
export function tomorrowOf(now = new Date()) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return [next.getFullYear(), next.getMonth() + 1, next.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

export function vacationUntilText({ backOn }, now = new Date()) {
  if (backOn == null) return 'until you are back';
  return backOn === tomorrowOf(now) ? 'until tomorrow' : `until ${dayLabel(backOn, now)}`;
}
