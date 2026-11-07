// Dates as local-time 'YYYY-MM-DD' strings, comparable with < and >.
const pad = (n) => String(n).padStart(2, '0');

function toDay(dateLike) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(day, n) {
  const d = fromDay(day);
  d.setDate(d.getDate() + n);
  return toDay(d);
}

module.exports = { toDay, fromDay, addDays };
