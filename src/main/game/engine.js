// Pure game rules: no I/O, easy to test.
const { SPECIES, STAGES, KINDS, BASELINE, MOOD } = require('./catalog');
const { toDay, fromDay, addDays } = require('../dates');
const { stats, emptyDay, dayXp, dayXpByKind } = require('./stats');
const { startDay, progressOf, collectionView, petFacts } = require('./collection');
const { mergePullRequests, prunePullRequests, pullRequestDays } = require('./pull-requests');
const { mergeCommits, commitDays, pruneByDay } = require('./commits');
const { mergeFastReviews, fastReviewDays, pruneFastReviews } = require('./review-speed');
const { achievementProgress, groupAchievements } = require('./achievements');
const { isOffDay } = require('./time-off');
const { pauseView } = require('./pause');
const { xpLog } = require('./xp-log');

const DAY_MS = 86400000;
const PR_SYNC_OVERLAP_MS = 60 * 60 * 1000;

// Old kinds (pushes, comments) from earlier versions are never read or kept.
const LEDGER_FIELDS = Object.keys(emptyDay());

/**
 * Fresh activity state: day ledger, the user's PRs, the commits and pushes already counted (to count each once),
 * the review requests seen and the fast reviews already counted, and the two sync marks.
 */
const emptyActivity = () => ({
  days: {},
  prs: [],
  commits: [],
  pushes: [],
  requests: [],
  fastReviews: [],
  lastSyncedAt: null,
  prsSyncedAt: null,
});

/** Event kinds counted one by one. Pushes give XP through their commits (see commits.js), not here. */
const COUNTED_EVENTS = new Set(['reviews', 'issues']);

/**
 * Counts review and issue events per day, only for the selected repos. Other event kinds give no XP here.
 * @param {{ events: { kind, repo, day }[], repos: string[] }} input
 * @returns {{ [day: string]: object }}
 */
function buildDays({ events, repos }) {
  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const days = {};
  for (const { kind, repo, day } of events) {
    if (!COUNTED_EVENTS.has(kind) || !selected.has(repo.toLowerCase())) continue;
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
 * then it reaches back to the day the first pet hatched minus the baseline window, so the baseline has real history.
 * Afterwards it is the last PR sync minus a small overlap.
 */
function prSyncStart({ pets, activity }) {
  if (!activity.prsSyncedAt) {
    return { backfill: true, since: fromDay(addDays(startDay(pets), -BASELINE.windowDays)) };
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
 * Applies fresh data to the activity (pure). `events`: normalized review and issue events; `prs`: normalized PRs
 * (client.pullRequests); `commits`: records `{ key, day }` found in `pushes` (`{ id, day }`, the pushes they came from);
 * `fastReviews`: records `{ key, day }` of reviews answered within the hour (see review-speed.js).
 * All optional. Day counts only ever grow, so partial data never lowers them.
 * @returns the new activity (other fields are kept)
 */
function applyActivity(
  activity,
  { events = [], prs = [], commits = [], pushes = [], fastReviews = [], repos, now = new Date() },
) {
  const allPrs = mergePullRequests(activity.prs ?? [], prs, repos);
  const allCommits = mergeCommits(activity.commits ?? [], commits);
  const allFast = mergeFastReviews(activity.fastReviews ?? [], fastReviews);
  // Days come from the unpruned lists: a PR, commit or review dropped from the stored list long ago still counts.
  const days = [
    buildDays({ events, repos }),
    pullRequestDays(allPrs),
    commitDays(allCommits),
    fastReviewDays(allFast),
  ].reduce(mergeDays, activity.days ?? {});
  return {
    ...activity,
    days,
    prs: prunePullRequests(allPrs, now),
    commits: pruneByDay(allCommits, now),
    fastReviews: pruneFastReviews(allFast, now),
    pushes: pruneByDay([...(activity.pushes ?? []), ...pushes], now),
  };
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

const MOOD_LABELS = { happy: 'Happy', neutral: 'Neutral' };

/**
 * Mood and why. Two moods: happy (merged recently or a strong week), else neutral. The pet is never anxious: a PR
 * that waits for review does not change how it feels.
 * @param {{ mergedRecently: number, ratio: number }} input
 * @returns {{ mood: 'happy' | 'neutral', moodLabel: string, moodReason: string | null }}
 */
function moodFor({ mergedRecently, ratio }) {
  const result = (mood, reason = null) => ({ mood, moodLabel: MOOD_LABELS[mood], moodReason: reason });
  if (mergedRecently > 0) return result('happy', `${plural(mergedRecently, 'PR')} merged recently`);
  if (ratio >= MOOD.strongWeekRatio) return result('happy', 'A strong week');
  return result('neutral');
}

/** XP and counts per kind for the last 7 days, from `since` on (the pet's birth day: what it did not earn is not shown). */
function weekSummary(days, today, since = '') {
  const weekStart = addDays(today, -6) > since ? addDays(today, -6) : since;
  const counts = () => Object.fromEntries(KINDS.map((kind) => [kind, 0]));
  const week = { ...counts(), xp: counts(), total: 0 };
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

/**
 * Derived status consumed by the UI: the active pet (name, species, stage, level and XP) and, around it, what belongs
 * to the person and not to one pet: mood, PRs, the week, streaks and achievements (all counted from the day the first
 * pet hatched), plus the whole `collection`. `repos`: the selected repos (the PR list is filtered by them).
 */
function computeStatus(
  { pets = {}, activePet, achievements, activity, repos = [], timeOff = [], pausedUntil = null },
  now = new Date(),
) {
  const pet = pets[activePet];
  if (!pet) return null;

  const today = toDay(now);
  const start = startDay(pets);
  const days = activity.days ?? {};
  const isOff = (day) => isOffDay(timeOff, day, today); // time off: like a weekend, it breaks nothing

  const sinceStart = Object.fromEntries(Object.entries(days).filter(([day]) => day >= start));
  const week = weekSummary(days, today, start); // what the person did since the first pet hatched
  const weekRatioXp = weekSummary(days, today).total; // the mood compares the whole week with the baseline
  const baseline = computeBaseline(days, today);

  // Level and stage follow the baseline, but what was reached is never lost.
  const progress = progressOf(pet, baseline);
  const stageView = (i) => ({ id: STAGES[i].id, name: STAGES[i].name, index: i, level: STAGES[i].level });

  const selected = new Set(repos.map((r) => r.toLowerCase()));
  const mine = (activity.prs ?? []).filter((pr) => selected.has(pr.repo.toLowerCase()));
  const recentSince = now.getTime() - MOOD.happyMergeHours * 3600000;
  const mergedRecently = mine.filter((pr) => pr.state === 'MERGED' && new Date(pr.mergedAt) >= recentSince).length;

  return {
    name: pet.name,
    species: SPECIES.find((s) => s.id === pet.species) ?? SPECIES[0],
    stage: stageView(progress.stageIndex),
    nextStage: progress.stageIndex + 1 < STAGES.length ? stageView(progress.stageIndex + 1) : null,
    level: progress.level,
    xp: progress.xp,
    levelXp: progress.levelXp,
    levelXpNeeded: progress.levelXpNeeded,
    ...moodFor({ mergedRecently, ratio: weekRatioXp / baseline }),
    pause: pauseView({ pausedUntil, timeOff, today, now: now.getTime() }),
    todayXp: dayXp(sinceStart[today]),
    week,
    xpLog: xpLog(sinceStart, now),
    baseline,
    lastSyncedAt: activity.lastSyncedAt,
    ...stats(sinceStart, now, isOff),
    collection: collectionView({ pets, activePet, baseline, now }),
    // What the person has achieved: derived from their history, plus what was recorded as reached (`achievements`).
    achievements: groupAchievements(
      achievementProgress({
        days: sinceStart,
        prs: mine,
        since: start,
        stored: achievements,
        pets: petFacts(pets),
        isOff,
      }),
    ),
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
