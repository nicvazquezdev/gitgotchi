// Small text helpers shared by the windows.

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "just now", "2 min ago", "3 hours ago", "2 days ago". */
export function timeAgo(date, now = Date.now()) {
  const minutes = Math.floor((now - new Date(date).getTime()) / 60000);
  if (!(minutes >= 1)) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${plural(hours, 'hour')} ago`;
  return `${plural(Math.floor(hours / 24), 'day')} ago`;
}

/** 'YYYY-MM-DD' as "Nov 7" (with the year when it is not this one). */
export function dayLabel(day, now = new Date()) {
  const date = new Date(`${day}T12:00:00`);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}
