// Pure game rules: no I/O, easy to test.
const { SPECIES, STAGES, WEIGHTS, BASELINE, MOOD_RATIOS, MAX_HEARTS, SLEEP_HOURS } = require('./catalog');
const { toDay, fromDay, addDays } = require('../dates');
const { stats, dayScore } = require('./stats');

const emptyDay = () => Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0]));

/**
 * Counts activity per day and kind, only for the selected repos.
 * @param {{ events: { kind, repo, day }[], repos: string[] }} input
 * @returns {{ [day: string]: { [kind: string]: number } }}
 */
function buildDays({ events, repos }) {
  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const days = {};
  for (const { kind, repo, day } of events) {
    if (!selected.has(repo.toLowerCase())) continue;
    days[day] ??= emptyDay();
    days[day][kind] += 1;
  }
  return days;
}

/**
 * Repo list for onboarding: recently active repos first,
 * then the rest by last push. No duplicates.
 */
function rankRepos(events, accessible) {
  const byName = new Map();
  const upsert = (repo, recent = 0) => {
    const key = repo.fullName.toLowerCase();
    const prev = byName.get(key);
    if (prev) prev.recent += recent;
    else byName.set(key, { ...repo, recent });
  };
  // Accessible repos first (they carry private/public), then add up activity.
  accessible.forEach((r) => upsert(r));
  events.forEach((e) => upsert({ fullName: e.repo }, 1));
  return [...byName.values()].sort(
    (a, b) => b.recent - a.recent || String(b.pushedAt).localeCompare(String(a.pushedAt)),
  );
}

/** Day to fetch activity from: last week or last sync, whichever is earlier. */
function syncStartDay({ activity }, now = new Date()) {
  const weekAgo = addDays(toDay(now), -6);
  const lastSynced = activity.lastSyncedAt ? addDays(toDay(activity.lastSyncedAt), -1) : weekAgo;
  return lastSynced < weekAgo ? lastSynced : weekAgo;
}

/**
 * Merges history with fresh data, keeping the max per day and kind.
 * A day that already fell out of GitHub's 300-event window keeps what was counted.
 */
function mergeDays(oldDays, newDays) {
  const merged = { ...oldDays };
  for (const [day, counts] of Object.entries(newDays)) {
    merged[day] = { ...emptyDay(), ...merged[day] };
    for (const [kind, n] of Object.entries(counts)) merged[day][kind] = Math.max(merged[day][kind] || 0, n);
  }
  return merged;
}

/**
 * Typical weekly score of the person, from their own history (rules in `BASELINE`).
 * @param {{ [day: string]: object }} days
 * @param {string} today 'YYYY-MM-DD'
 * @returns {number}
 */
function computeBaseline(days, today) {
  const { windowDays, minHistoryDays, defaultWeekly, floorWeekly } = BASELINE;
  const windowStart = addDays(today, -(windowDays - 1));
  const recorded = Object.keys(days).filter((day) => day <= today);
  if (!recorded.length) return defaultWeekly;

  const firstDay = recorded.reduce((a, b) => (a < b ? a : b));
  const start = firstDay > windowStart ? firstDay : windowStart;
  const spanDays = Math.round((fromDay(today) - fromDay(start)) / 86400000) + 1;
  if (spanDays < minHistoryDays) return defaultWeekly;

  const total = recorded.filter((day) => day >= start).reduce((sum, day) => sum + dayScore(days[day]), 0);
  return Math.max(floorWeekly, Math.round((total / spanDays) * 7));
}

/** Stages with XP thresholds scaled to the person's baseline. */
function personalStages(baseline) {
  return STAGES.map((s, index) => ({
    ...s,
    index,
    minXp: s.minWeeks ? Math.max(1, Math.round(s.minWeeks * baseline)) : 0,
  }));
}

function moodFor(ratio, now) {
  const h = now.getHours();
  if (h >= SLEEP_HOURS.from && h < SLEEP_HOURS.to) return 'sleeping';
  if (ratio >= MOOD_RATIOS.happy) return 'happy';
  if (ratio >= MOOD_RATIOS.ok) return 'idle';
  return 'sad';
}

/** Derived pet status consumed by the UI. */
function computeStatus({ pet, activity }, now = new Date()) {
  if (!pet) return null;

  const today = toDay(now);
  const birthDay = toDay(pet.bornAt);
  const weekStart = addDays(today, -6);

  // XP: activity since birth (growth). Week: last 7 days (mood).
  let xp = 0;
  const week = emptyDay();
  for (const [day, d] of Object.entries(activity.days)) {
    if (day >= birthDay) xp += dayScore(d);
    if (day >= weekStart && day <= today) for (const k of Object.keys(week)) week[k] += d[k] || 0;
  }
  const weekScore = dayScore(week);

  const baseline = computeBaseline(activity.days, today);
  const ratio = weekScore / baseline;

  // Thresholds follow the baseline, but a stage already reached is never lost.
  const stages = personalStages(baseline);
  const earned = stages.findLastIndex((s) => xp >= s.minXp);
  const stage = stages[Math.max(earned, pet.stageIndex ?? 0)];
  const nextStage = stages[stage.index + 1] ?? null;
  const progress = nextStage ? (xp - stage.minXp) / (nextStage.minXp - stage.minXp) : 1;

  return {
    name: pet.name,
    species: SPECIES.find((s) => s.id === pet.species) ?? SPECIES[0],
    xp,
    stage,
    nextStage,
    progress: Math.min(1, Math.max(0, progress)),
    baseline,
    week,
    weekScore,
    mood: moodFor(ratio, now),
    hearts: Math.min(MAX_HEARTS, Math.ceil((ratio / MOOD_RATIOS.happy) * MAX_HEARTS)),
    maxHearts: MAX_HEARTS,
    lastSyncedAt: activity.lastSyncedAt,
    ...stats(activity.days, now),
  };
}

module.exports = { buildDays, rankRepos, syncStartDay, mergeDays, computeStatus, computeBaseline };
