// Pure achievements: how far each one is and when it was reached. No I/O. Definitions: game/catalog.js.
const { ACHIEVEMENTS, ACHIEVEMENT_GROUPS, ACHIEVEMENT_TIERS, ACHIEVEMENT_RULES } = require('./catalog');
const { dayXp, streakLengths } = require('./stats');
const { toDay } = require('../dates');

const LEDGER_KINDS = ['prs', 'reviews', 'merges', 'commits', 'issues'];
const UNITS = {
  prs: 'PRs',
  reviews: 'reviews',
  merges: 'merges',
  commits: 'commits',
  issues: 'issues',
  streak: 'days',
};

const POINTS = Object.fromEntries(ACHIEVEMENT_TIERS.map((tier) => [tier.id, tier.points]));

const byDay = (a, b) => a[0].localeCompare(b[0]);

/** A PR merged within `quickMergeMinutes` of being opened. */
const isQuickMerge = (pr) =>
  new Date(pr.mergedAt) - new Date(pr.createdAt) <= ACHIEVEMENT_RULES.quickMergeMinutes * 60000;

/**
 * What each metric counted, as `[day, count]` pairs oldest first (days with nothing are left out).
 * `streak` is not here: it is not a sum (see `measure`).
 */
function seriesByMetric(days, prs, since) {
  const dayList = Object.keys(days).sort();
  const series = {};
  for (const kind of LEDGER_KINDS) {
    series[kind] = dayList.map((day) => [day, days[day][kind] || 0]).filter(([, n]) => n > 0);
  }
  const full = (d) => d.prs > 0 && d.reviews > 0 && d.merges > 0;
  series.fullDays = dayList.filter((day) => full(days[day])).map((day) => [day, 1]);
  series.quickMerges = prs
    .filter((pr) => pr.state === 'MERGED' && pr.mergedAt && toDay(pr.mergedAt) >= since && isQuickMerge(pr))
    .map((pr) => [toDay(pr.mergedAt), 1])
    .sort(byDay);
  return series;
}

/** `{ total, reachedDay }`: the count so far and the first day it was `target` or more (null before that). */
function measure({ metric, target }, { series, lengths }) {
  if (metric === 'streak') {
    const entries = [...lengths];
    return {
      total: Math.max(0, ...lengths.values()),
      reachedDay: entries.find(([, length]) => length >= target)?.[0] ?? null,
    };
  }
  let total = 0;
  let reachedDay = null;
  for (const [day, n] of series[metric]) {
    total += n;
    if (reachedDay === null && total >= target) reachedDay = day;
  }
  return { total, reachedDay };
}

/**
 * Progress of every achievement.
 * @param {object} input
 * @param {{ [day: string]: object }} input.days  the ledger since the pet's birth day
 * @param {object[]} [input.prs]  the stored PR records (recent ones only)
 * @param {string} [input.since]  the pet's birth day: PRs merged before it do not count
 * @param {{ [id: string]: string }} [input.stored]  achievements recorded as reached: id -> day. They stay reached
 *   whatever the ledger says now (it can be rebuilt), and their day is the one recorded.
 * @returns {{ id, group, metric, tier, points, icon, name, description, unit, target, value, unlockedAt }[]}
 *   `unlockedAt`: the day reached ('YYYY-MM-DD') or null; `value` never goes past `target`
 */
function achievementProgress({ days, prs = [], since = '', stored = {} }) {
  const active = Object.keys(days)
    .filter((day) => dayXp(days[day]) > 0)
    .sort();
  const context = { series: seriesByMetric(days, prs, since), lengths: streakLengths(active) };
  return ACHIEVEMENTS.map((def) => {
    const { total, reachedDay } = measure(def, context);
    const unlockedAt = stored[def.id] ?? (total >= def.target ? reachedDay : null);
    const { id, group, icon, name, description, target, metric, tier } = def;
    return {
      id,
      group,
      metric,
      tier,
      points: POINTS[tier],
      icon,
      name,
      description,
      unit: UNITS[metric] ?? '',
      target,
      value: unlockedAt ? target : Math.min(total, target),
      unlockedAt,
    };
  });
}

/**
 * The list grouped for the UI, in the catalog's order. `points`: the score of what is unlocked (of `totalPoints`).
 * `tiers`: how many of each tier are unlocked, in the catalog's order.
 * @returns {{ unlocked, total, points, totalPoints, tiers: { id, name, unlocked, total }[],
 *   groups: { id, name, note, items }[] }}
 */
function groupAchievements(list) {
  const done = list.filter((a) => a.unlockedAt);
  const sum = (items) => items.reduce((total, a) => total + a.points, 0);
  return {
    unlocked: done.length,
    total: list.length,
    points: sum(done),
    totalPoints: sum(list),
    tiers: ACHIEVEMENT_TIERS.map(({ id, name }) => ({
      id,
      name,
      unlocked: done.filter((a) => a.tier === id).length,
      total: list.filter((a) => a.tier === id).length,
    })),
    groups: ACHIEVEMENT_GROUPS.map(({ id, name, note = null }) => ({
      id,
      name,
      note,
      items: list.filter((a) => a.group === id),
    })),
  };
}

/** The unlocked ones of a grouped view. */
const unlockedOf = ({ groups }) => groups.flatMap((g) => g.items).filter((a) => a.unlockedAt);

module.exports = { achievementProgress, groupAchievements, unlockedOf };
