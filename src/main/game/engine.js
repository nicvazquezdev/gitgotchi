// Pure game rules: no I/O, easy to test.
const { SPECIES, STAGES, WEIGHTS, MOOD_THRESHOLDS, MAX_HEARTS, SLEEP_HOURS } = require('./catalog');
const { toDay, addDays } = require('../dates');
const { stats } = require('./stats');

const emptyDay = () => Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, 0]));

const dayScore = (d) => Object.entries(WEIGHTS).reduce((sum, [k, w]) => sum + (d[k] || 0) * w, 0);

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

function moodFor(weekScore, now) {
  const h = now.getHours();
  if (h >= SLEEP_HOURS.from && h < SLEEP_HOURS.to) return 'sleeping';
  if (weekScore >= MOOD_THRESHOLDS.happy) return 'happy';
  if (weekScore >= MOOD_THRESHOLDS.ok) return 'idle';
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

  const stageIndex = STAGES.findLastIndex((s) => xp >= s.minXp);
  const stage = STAGES[stageIndex];
  const nextStage = STAGES[stageIndex + 1] ?? null;

  return {
    name: pet.name,
    species: SPECIES.find((s) => s.id === pet.species) ?? SPECIES[0],
    xp,
    stage: { ...stage, index: stageIndex },
    nextStage,
    progress: nextStage ? (xp - stage.minXp) / (nextStage.minXp - stage.minXp) : 1,
    week,
    weekScore,
    mood: moodFor(weekScore, now),
    hearts: Math.min(MAX_HEARTS, Math.ceil((weekScore / MOOD_THRESHOLDS.happy) * MAX_HEARTS)),
    maxHearts: MAX_HEARTS,
    lastSyncedAt: activity.lastSyncedAt,
    ...stats(activity.days, now),
  };
}

module.exports = { buildDays, rankRepos, syncStartDay, mergeDays, computeStatus };
