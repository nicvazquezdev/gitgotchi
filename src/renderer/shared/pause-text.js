// How a pause is said to the person (pure): "until 3:42 PM", "until tomorrow", "until Jun 19" or "until you resume".
// `pause` is the one of the status: `{ active, until, backOn }` (see main/game/pause.js).
import { dayLabel } from './format.js';

/** 'YYYY-MM-DD' of the day after `now`, in the person's day. */
export function tomorrowOf(now = new Date()) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  return [next.getFullYear(), next.getMonth() + 1, next.getDate()].map((n) => String(n).padStart(2, '0')).join('-');
}

/** Which of the three lengths this pause is: 'hour' | 'tomorrow' | 'vacation', or 'off' when nothing is paused. */
export function pauseKind({ active, until, backOn }, now = new Date()) {
  if (!active) return 'off';
  if (until != null) return 'hour';
  return backOn === tomorrowOf(now) ? 'tomorrow' : 'vacation';
}

export function pauseUntilText({ until, backOn }, now = new Date()) {
  if (until != null)
    return `until ${new Date(until).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (backOn == null) return 'until you resume';
  return backOn === tomorrowOf(now) ? 'until tomorrow' : `until ${dayLabel(backOn, now)}`;
}
