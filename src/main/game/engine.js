// Pure game rules: no I/O, easy to test.
const { SPECIES, STAGES, KINDS, BASELINE, MOOD, SLEEP_HOURS } = require('./catalog');
const { toDay, fromDay, addDays } = require('../dates');
const { stats, dayXp, dayXpByKind } = require('./stats');
const { xpForLevel, levelAt, stageIndexFor } = require('./levels');
const { mergePullRequests, prunePullRequests, pullRequestDays, classify } = require('./pull-requests');

const DAY_MS = 86400000;
const PR_SYNC_OVERLAP_MS = 60 * 60 * 1000;

/** One ledger day. Old kinds (pushes, comments, issues) from earlier versions are never read or kept. */
const emptyDay = () => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0 });
const LEDGER_FIELDS = Object.keys(emptyDay());

/** Fresh activity state: day ledger, the user's PRs and the two sync marks. */
const emptyActivity = () => ({ days: {}, prs: [], lastSyncedAt: null, prsSyncedAt: null });

/**
 * Counts review events per day, only for the selected repos. Other event kinds give no XP and are ignored.
 * @param {{ events: { kind, repo, day }[], repos: string[] }} input
 * @returns {{ [day: string]: object }}
 */
function buildDays({ events, repos }) {
  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const days = {};
  for (const { kind, repo, day } of events) {
    if (kind !== 'reviews' || !selected.has(repo.toLowerCase())) continue;
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

/** Day to fetch review events from: last week or last sync, whichever is earlier. */
function syncStartDay({ activity }, now = new Date()) {
  const weekAgo = addDays(toDay(now), -6);
  const lastSynced = activity.lastSyncedAt ? addDays(toDay(activity.lastSyncedAt), -1) : weekAgo;
  return lastSynced < weekAgo ? lastSynced : weekAgo;
}

/**
 * What to fetch from GraphQL: PRs updated since this moment. `backfill` is true until the first PR sync:
 * then it reaches back to the pet's birth minus the baseline window, so the baseline has real history.
 * Afterwards it is the last PR sync minus a small overlap.
 */
function prSyncStart({ pet, activity }) {
  if (!activity.prsSyncedAt) {
    return { backfill: true, since: fromDay(addDays(toDay(pet.bornAt), -BASELINE.windowDays)) };
  }
  return { backfill: false, since: new Date(new Date(activity.prsSyncedAt).getTime() - PR_SYNC_OVERLAP_MS) };
}

/**
 * Merges history with fresh data, keeping the max per day and kind.
 * A day that already fell out of GitHub's 300-event window keeps what was counted.
 * Only current ledger fields are kept (old kinds are dropped).
 */
function mergeDays(oldDays, newDays) {
  const merged = { ...oldDays };
  for (const [day, counts] of Object.entries(newDays)) {
    const prev = merged[day] ?? {};
    merged[day] = Object.fromEntries(
      LEDGER_FIELDS.map((field) => [field, Math.max(prev[field] || 0, counts[field] || 0)]),
    );
  }
  return merged;
}

/**
 * Applies fresh data to the activity (pure). `events`: normalized review events; `prs`: normalized PRs
 * (client.pullRequests). Both optional. Day counts only ever grow, so partial data never lowers them.
 * @returns the new activity (other fields are kept)
 */
function applyActivity(activity, { events = [], prs = [], repos, now = new Date() }) {
  const all = mergePullRequests(activity.prs ?? [], prs, repos);
  // Days come from the unpruned list: a PR merged long ago is dropped from the stored list but still counts.
  const days = mergeDays(mergeDays(activity.days ?? {}, buildDays({ events, repos })), pullRequestDays(all));
  return { ...activity, days, prs: prunePullRequests(all, now) };
}

/**
 * Typical weekly XP of the person, from their own history (rules in `BASELINE`).
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
  const spanDays = Math.round((fromDay(today) - fromDay(start)) / DAY_MS) + 1;
  if (spanDays < minHistoryDays) return defaultWeekly;

  const total = recorded.filter((day) => day >= start).reduce((sum, day) => sum + dayXp(days[day]), 0);
  return Math.max(floorWeekly, Math.round((total / spanDays) * 7));
}

/**
 * New activity between two histories: per-kind count increases only, zero kinds omitted.
 * Never negative. Returns `{}` when nothing is new.
 * @returns {{ [kind: string]: number }}
 */
function diffDays(oldDays, newDays) {
  const delta = {};
  for (const [day, counts] of Object.entries(newDays)) {
    for (const kind of KINDS) {
      const added = (counts[kind] || 0) - (oldDays[day]?.[kind] || 0);
      if (added > 0) delta[kind] = (delta[kind] || 0) + added;
    }
  }
  return delta;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const MOOD_LABELS = { happy: 'Happy', idle: 'Content', anxious: 'Anxious', sad: 'Bored', sleeping: 'Sleeping' };

/**
 * Mood and why. Order: sleeping (night), anxious (PRs waiting for review), happy (merged recently or a strong
 * week), sad (quiet week, once the pet is old enough to judge), else idle.
 * @param {{ waiting: { ageDays: number }[], mergedRecently: number, ratio: number, petAgeDays: number }} input
 * @returns {{ mood: string, moodLabel: string, moodReason: string | null }}
 */
function moodFor({ waiting, mergedRecently, ratio, petAgeDays }, now) {
  const result = (mood, reason = null) => ({ mood, moodLabel: MOOD_LABELS[mood], moodReason: reason });
  const hour = now.getHours();
  if (hour >= SLEEP_HOURS.from && hour < SLEEP_HOURS.to)
    return result('sleeping', `Resting until ${SLEEP_HOURS.to}:00`);

  const stale = waiting.filter((pr) => pr.ageDays >= MOOD.anxiousAfterDays);
  if (stale.length > 0) {
    const days = Math.max(...stale.map((pr) => pr.ageDays));
    return result('anxious', `${plural(stale.length, 'PR')} waiting for ${days} days`);
  }
  if (mergedRecently > 0) return result('happy', `${plural(mergedRecently, 'PR')} merged recently`);
  if (ratio >= MOOD.strongWeekRatio) return result('happy', 'A strong week');
  if (ratio < MOOD.quietWeekRatio && petAgeDays >= BASELINE.minHistoryDays) return result('sad', 'A quiet week');
  return result('idle');
}

/** XP and counts per kind for the last 7 days. */
function weekSummary(days, today) {
  const weekStart = addDays(today, -6);
  const week = { prs: 0, reviews: 0, merges: 0, xp: { prs: 0, reviews: 0, merges: 0 }, total: 0 };
  for (const [day, d] of Object.entries(days)) {
    if (day < weekStart || day > today) continue;
    const xp = dayXpByKind(d);
    for (const kind of KINDS) {
      week[kind] += d[kind] || 0;
      week.xp[kind] += xp[kind];
    }
    week.total += dayXp(d);
  }
  return week;
}

/** Derived pet status consumed by the UI. `repos`: the selected repos (the PR list is filtered by them). */
function computeStatus({ pet, activity, repos = [] }, now = new Date()) {
  if (!pet) return null;

  const today = toDay(now);
  const birthDay = toDay(pet.bornAt);
  const days = activity.days ?? {};

  const xp = Object.entries(days).reduce((sum, [day, d]) => (day >= birthDay ? sum + dayXp(d) : sum), 0);
  const week = weekSummary(days, today);
  const baseline = computeBaseline(days, today);

  // Level and stage follow the baseline, but what was reached is never lost.
  const stageFloor = pet.stageIndex ?? 0;
  const level = Math.max(levelAt(xp, baseline), pet.level ?? 1, STAGES[stageFloor].level);
  const stageIndex = Math.max(stageIndexFor(level), stageFloor);
  const levelStart = xpForLevel(level, baseline);
  const levelXpNeeded = xpForLevel(level + 1, baseline) - levelStart;
  const stageView = (i) => ({ id: STAGES[i].id, name: STAGES[i].name, index: i, level: STAGES[i].level });

  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const mine = (activity.prs ?? []).filter((pr) => selected.has(pr.repo.toLowerCase()));
  const prs = classify(mine, now);
  const recentSince = now.getTime() - MOOD.happyMergeHours * 3600000;
  const mergedRecently = mine.filter((pr) => pr.state === 'MERGED' && new Date(pr.mergedAt) >= recentSince).length;
  const petAgeDays = (now.getTime() - new Date(pet.bornAt).getTime()) / DAY_MS;

  return {
    name: pet.name,
    species: SPECIES.find((s) => s.id === pet.species) ?? SPECIES[0],
    stage: stageView(stageIndex),
    nextStage: stageIndex + 1 < STAGES.length ? stageView(stageIndex + 1) : null,
    level,
    xp,
    levelXp: Math.min(levelXpNeeded, Math.max(0, xp - levelStart)),
    levelXpNeeded,
    ...moodFor({ waiting: prs.waiting, mergedRecently, ratio: week.total / baseline, petAgeDays }, now),
    week,
    prs,
    baseline,
    lastSyncedAt: activity.lastSyncedAt,
    ...stats(days, now),
  };
}

module.exports = {
  buildDays,
  rankRepos,
  syncStartDay,
  prSyncStart,
  mergeDays,
  diffDays,
  applyActivity,
  emptyActivity,
  computeStatus,
  computeBaseline,
  moodFor,
};
