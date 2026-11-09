const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildDays,
  rankRepos,
  syncStartDay,
  prSyncStart,
  mergeDays,
  applyActivity,
  computeStatus,
} = require('../src/main/game/engine');
const {
  WEIGHTS,
  DAILY_CAPS,
  BASELINE,
  MOOD,
  PR_KEEP_MERGED_DAYS,
  COMMIT_KEEP_DAYS,
} = require('../src/main/game/catalog');
const { earnedSince } = require('../src/main/game/collection');
const { toDay, addDays } = require('../src/main/dates');

const NOON = new Date(2026, 5, 15, 12);
const ev = (kind, repo, day) => ({ kind, repo, day });
const day = (c = {}) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, commits: 0, issues: 0, fastReviews: 0, ...c });
const activity = (days = {}, extra = {}) => ({ days, prs: [], lastSyncedAt: null, prsSyncedAt: null, ...extra });
const pet = (bornAt = new Date(2026, 0, 1), extra = {}) => ({
  name: 'Pixel',
  species: 'phoenix',
  bornAt: bornAt.toISOString(),
  ...extra,
});
const hoursAgo = (h) => new Date(NOON.getTime() - h * 3600000).toISOString();
const daysAgo = (d) => hoursAgo(d * 24);
let nextId = 0;
/** A normalized PR (as the client returns it). */
const pr = (o = {}) => ({
  id: `pr${nextId++}`,
  number: 1,
  title: 'Fix things',
  url: 'https://github.com/a/b/pull/1',
  repo: 'a/b',
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  lines: 50,
  createdAt: hoursAgo(1),
  mergedAt: null,
  ...o,
});
/** A state with one pet, active, that has earned what the ledger gave since its birth (like a migrated pet). */
const stateOf = (acts, p = pet(), repos = ['a/b']) => ({
  pets: { [p.species]: { ...p, earned: p.earned ?? earnedSince(acts.days, p.bornAt) } },
  activePet: p.species,
  activity: acts,
  repos,
});
const status = (acts, extra = {}, now = NOON) => computeStatus(stateOf(acts, pet(undefined, extra.pet)), now);

describe('buildDays', () => {
  test('counts review events per day for the selected repos only', () => {
    const events = [
      ev('reviews', 'a/b', '2026-06-01'),
      ev('reviews', 'a/b', '2026-06-01'),
      ev('reviews', 'x/y', '2026-06-01'),
    ];
    assert.deepEqual(buildDays({ events, repos: ['A/B'] }), { '2026-06-01': day({ reviews: 2 }) });
  });

  test('counts opened issues like reviews', () => {
    const events = [
      ev('issues', 'a/b', '2026-06-01'),
      ev('issues', 'x/y', '2026-06-01'),
      ev('reviews', 'a/b', '2026-06-02'),
    ];
    assert.deepEqual(buildDays({ events, repos: ['a/b'] }), {
      '2026-06-01': day({ issues: 1 }),
      '2026-06-02': day({ reviews: 1 }),
    });
  });

  test('other kinds give no XP here and are ignored (pushes count through their commits)', () => {
    const events = ['pushes', 'comments', 'prs', 'merges', 'stars'].map((k) => ev(k, 'a/b', '2026-06-01'));
    assert.deepEqual(buildDays({ events, repos: ['a/b'] }), {});
  });

  test('returns nothing when no repo is selected', () => {
    assert.deepEqual(buildDays({ events: [ev('reviews', 'a/b', '2026-06-01')], repos: [] }), {});
  });
});

describe('rankRepos', () => {
  const repo = (fullName, pushedAt) => ({ fullName, private: false, pushedAt });

  test('dedupes case-insensitively and keeps accessible metadata', () => {
    const ranked = rankRepos([{ repo: 'A/B' }], [repo('a/b', '2026-01-01')]);
    assert.equal(ranked.length, 1);
    assert.equal(ranked[0].fullName, 'a/b');
    assert.equal(ranked[0].private, false);
  });

  test('orders by recent activity, then by pushedAt', () => {
    const accessible = [repo('old/x', '2026-01-01'), repo('new/x', '2026-05-01'), repo('busy/x', '2025-01-01')];
    const events = [{ repo: 'busy/x' }, { repo: 'busy/x' }, { repo: 'old/x' }];
    assert.deepEqual(
      rankRepos(events, accessible).map((r) => r.fullName),
      ['busy/x', 'old/x', 'new/x'],
    );
  });

  test('orders repos without activity by pushedAt, newest first', () => {
    const accessible = [repo('a/x', '2026-01-01'), repo('b/x', '2026-05-01')];
    assert.deepEqual(
      rankRepos([], accessible).map((r) => r.fullName),
      ['b/x', 'a/x'],
    );
  });

  test('includes event repos that are not accessible', () => {
    assert.deepEqual(
      rankRepos([{ repo: 'gone/x' }], []).map((r) => r.fullName),
      ['gone/x'],
    );
  });
});

describe('syncStartDay', () => {
  const synced = (...date) => ({ activity: activity({}, { lastSyncedAt: new Date(...date).toISOString() }) });

  test('without prior sync starts 6 days ago', () => {
    assert.equal(syncStartDay({ activity: activity() }, NOON), '2026-06-09');
  });

  test('recent sync still covers the last week', () => {
    assert.equal(syncStartDay(synced(2026, 5, 15, 8), NOON), '2026-06-09');
  });

  test('old sync starts the day before the last sync', () => {
    assert.equal(syncStartDay(synced(2026, 5, 1, 8), NOON), '2026-05-31');
  });
});

describe('prSyncStart', () => {
  test('first sync backfills from birth minus the baseline window', () => {
    const { backfill, since } = prSyncStart(stateOf(activity(), pet(new Date(2026, 5, 10, 9))));
    assert.equal(backfill, true);
    assert.equal(toDay(since), addDays('2026-06-10', -BASELINE.windowDays));
  });

  test('later syncs are incremental from the last PR sync, with a small overlap', () => {
    const prsSyncedAt = new Date(2026, 5, 15, 11).toISOString();
    const { backfill, since } = prSyncStart(stateOf(activity({}, { prsSyncedAt })));
    assert.equal(backfill, false);
    assert.ok(since < new Date(prsSyncedAt) && new Date(prsSyncedAt) - since <= 3600000);
  });
});

describe('mergeDays', () => {
  test('keeps the max per day and kind', () => {
    const merged = mergeDays(
      { '2026-06-01': day({ reviews: 5, prs: 1 }) },
      { '2026-06-01': day({ reviews: 2, prs: 3 }) },
    );
    assert.deepEqual(merged['2026-06-01'], day({ reviews: 5, prs: 3 }));
  });

  test('keeps old days missing from new data and adds new days', () => {
    const merged = mergeDays({ '2026-05-01': day({ reviews: 4 }) }, { '2026-06-01': day({ reviews: 1 }) });
    assert.deepEqual(Object.keys(merged).sort(), ['2026-05-01', '2026-06-01']);
    assert.equal(merged['2026-05-01'].reviews, 4);
  });

  test('drops old kinds and survives an old-shaped day', () => {
    const merged = mergeDays(
      { '2026-06-01': { pushes: 9, comments: 3, issues: 1, reviews: 2 } },
      { '2026-06-01': day() },
    );
    assert.deepEqual(merged['2026-06-01'], day({ reviews: 2, issues: 1 }));
  });

  test('does not mutate inputs', () => {
    const old = { '2026-06-01': day({ reviews: 1 }) };
    mergeDays(old, { '2026-06-01': day({ reviews: 9 }) });
    assert.equal(old['2026-06-01'].reviews, 1);
  });
});

describe('applyActivity', () => {
  const apply = (acts, data) => applyActivity(acts, { repos: ['a/b'], now: NOON, ...data });

  test('opened and merged PRs fill the day ledger with size XP', () => {
    const merged = pr({ lines: 600, state: 'MERGED', createdAt: daysAgo(3), mergedAt: hoursAgo(2) });
    const small = pr({ lines: 5, createdAt: daysAgo(3) });
    const result = apply(activity(), { prs: [merged, small] });
    assert.deepEqual(result.days[toDay(daysAgo(3))], day({ prs: 2, prsXp: 30 + 5 }));
    assert.deepEqual(result.days[toDay(hoursAgo(2))], day({ merges: 1 }));
    assert.equal(result.prs.length, 2);
  });

  test('commits fill the ledger on the day of their push and are counted once', () => {
    const commits = [
      { key: 'a/b|1|first', day: '2026-06-14' },
      { key: 'a/b|2|second', day: '2026-06-14' },
    ];
    const once = apply(activity(), { commits, pushes: [{ id: '7', day: '2026-06-14' }] });
    assert.equal(once.days['2026-06-14'].commits, 2);
    assert.deepEqual(once.pushes, [{ id: '7', day: '2026-06-14' }]);
    // The same commits arriving again (another push, a rebase) add nothing.
    const twice = apply(once, { commits: [{ key: 'a/b|1|first', day: '2026-06-15' }] });
    assert.deepEqual(twice.days, once.days);
    assert.equal(twice.commits.length, 2);
  });

  test('old commit and push records are pruned but their XP stays', () => {
    const old = toDay(daysAgo(COMMIT_KEEP_DAYS + 3));
    const first = apply(activity(), { commits: [{ key: 'k', day: old }], pushes: [{ id: '1', day: old }] });
    assert.deepEqual(first.commits, []);
    assert.deepEqual(first.pushes, []);
    assert.equal(first.days[old].commits, 1);
  });

  test('issue events fill the ledger too', () => {
    const result = apply(activity(), { events: [ev('issues', 'a/b', '2026-06-14')] });
    assert.deepEqual(result.days['2026-06-14'], day({ issues: 1 }));
  });

  test('PRs of unselected repos are ignored', () => {
    const result = apply(activity(), { prs: [pr({ repo: 'other/x' })] });
    assert.deepEqual(result.days, {});
    assert.deepEqual(result.prs, []);
  });

  test('applying the same PRs twice changes nothing (idempotent)', () => {
    const data = { prs: [pr({ lines: 20 }), pr({ state: 'MERGED', mergedAt: hoursAgo(1) })] };
    const once = apply(activity(), data);
    assert.deepEqual(apply(once, data), once);
  });

  test('a PR keeps its slot: state changes replace it by id', () => {
    const open = pr({ id: 'x' });
    const first = apply(activity(), { prs: [open] });
    const second = apply(first, { prs: [{ ...open, state: 'MERGED', mergedAt: hoursAgo(0.5) }] });
    assert.equal(second.prs.length, 1);
    assert.equal(second.prs[0].state, 'MERGED');
  });

  test('closed-unmerged PRs leave the list but keep the XP they gave when opened', () => {
    const open = pr({ id: 'x', lines: 50, createdAt: daysAgo(1) });
    const first = apply(activity(), { prs: [open] });
    const second = apply(first, { prs: [{ ...open, state: 'CLOSED' }] });
    assert.deepEqual(second.prs, []);
    assert.equal(second.days[toDay(daysAgo(1))].prsXp, 10);
  });

  test('old merged PRs count once in the ledger but are not kept in the list', () => {
    const old = pr({ createdAt: daysAgo(40), state: 'MERGED', mergedAt: daysAgo(PR_KEEP_MERGED_DAYS + 5) });
    const result = apply(activity(), { prs: [old] });
    assert.deepEqual(result.prs, []);
    assert.equal(result.days[toDay(old.mergedAt)].merges, 1);
    // Later syncs without that PR do not lower the count.
    assert.equal(apply(result, { prs: [] }).days[toDay(old.mergedAt)].merges, 1);
  });

  test('review events merge by max and never lower the count', () => {
    const first = apply(activity(), {
      events: [ev('reviews', 'a/b', '2026-06-14'), ev('reviews', 'a/b', '2026-06-14')],
    });
    const second = apply(first, { events: [ev('reviews', 'a/b', '2026-06-14')] });
    assert.equal(second.days['2026-06-14'].reviews, 2);
  });

  test('keeps sync marks and tolerates an old-shaped activity', () => {
    const old = { days: { '2026-06-01': { pushes: 3, reviews: 1 } }, lastSyncedAt: 'x' };
    const result = apply(old, { prs: [pr()] });
    assert.equal(result.lastSyncedAt, 'x');
    assert.equal(result.days['2026-06-01'].reviews, 1);
    assert.equal(result.prs.length, 1);
  });
});

describe('computeStatus', () => {
  test('returns null without an active pet', () => {
    assert.equal(computeStatus({ pets: {}, activePet: null, activity: activity() }, NOON), null);
    assert.equal(computeStatus({ pets: { koi: pet() }, activePet: 'phoenix', activity: activity() }, NOON), null);
  });

  test('xp counts only days since birth, by the XP rules', () => {
    const days = {
      '2026-06-10': day({ reviews: 1 }),
      '2026-06-14': day({ reviews: 2, prs: 1, prsXp: 20 }),
      '2026-06-15': day({ merges: 1 }),
    };
    const s = computeStatus(stateOf(activity(days), pet(new Date(2026, 5, 14, 9))), NOON);
    assert.equal(s.xp, 2 * WEIGHTS.reviews + 20 + WEIGHTS.merges); // the day before birth is out
  });

  test('commits and issues give XP, and commits stop at the daily cap', () => {
    const cap = DAILY_CAPS.commits;
    const days = {
      '2026-06-15': day({ commits: cap + 25, issues: 2 }), // the real count is kept; XP stops at the cap
      '2026-06-14': day({ commits: 3 }),
    };
    const { week, xp } = status(activity(days));
    assert.equal(week.commits, cap + 25 + 3);
    assert.deepEqual(week.xp, {
      prs: 0,
      reviews: 0,
      merges: 0,
      commits: (cap + 3) * WEIGHTS.commits,
      issues: 2 * WEIGHTS.issues,
    });
    assert.equal(xp, (cap + 3) * WEIGHTS.commits + 2 * WEIGHTS.issues);
  });

  test('week covers only the last 7 days, with counts and XP per kind', () => {
    const days = {
      '2026-06-08': day({ reviews: 10 }), // 7 days ago: out
      '2026-06-09': day({ reviews: 1, prs: 1, prsXp: 10 }), // 6 days ago: in
      '2026-06-15': day({ merges: 2 }),
      '2026-06-16': day({ reviews: 50 }), // future: out
    };
    const { week } = status(activity(days));
    assert.deepEqual(week, {
      prs: 1,
      reviews: 1,
      merges: 2,
      commits: 0,
      issues: 0,
      xp: { prs: 10, reviews: WEIGHTS.reviews, merges: 2 * WEIGHTS.merges, commits: 0, issues: 0 },
      total: 10 + WEIGHTS.reviews + 2 * WEIGHTS.merges,
    });
  });

  test('week only counts what happened since the first pet hatched, so it never exceeds the total XP', () => {
    const days = {
      '2026-06-10': day({ reviews: 20 }), // before the pet was born
      '2026-06-14': day({ reviews: 2 }),
    };
    const born = computeStatus(stateOf(activity(days), pet(new Date(2026, 5, 13)), []), NOON);
    assert.equal(born.week.reviews, 2);
    assert.equal(born.week.total, 2 * WEIGHTS.reviews);
    assert.equal(born.week.total, born.xp);
  });

  test('old-shaped days (pushes, comments) give no XP and do not crash', () => {
    const s = status(activity({ '2026-06-15': { pushes: 9, comments: 9, prs: 3, merges: 0, reviews: 0 } }));
    assert.equal(s.xp, 0);
    assert.equal(s.week.total, 0);
  });

  test('exposes level progress, stages and the status contract', () => {
    const s = status(activity({ '2026-06-15': day({ reviews: 3 }) }));
    assert.equal(s.name, 'Pixel');
    assert.equal(s.xp, 30);
    assert.ok(s.level >= 1 && s.levelXp >= 0 && s.levelXp <= s.levelXpNeeded);
    assert.equal(s.stage.id, 'baby');
    assert.deepEqual(s.nextStage, { id: 'kid', name: 'Kid', index: 1, level: 5 });
    for (const key of ['moodLabel', 'moodReason', 'prs', 'streak', 'bestStreak', 'history', 'baseline', 'species'])
      assert.ok(key in s, key);
  });

  test('level and stage floors are never lost', () => {
    const s = status(activity(), { pet: { stageIndex: 2, level: 12 } });
    assert.equal(s.level, 12);
    assert.equal(s.stage.index, 2);
    assert.equal(status(activity(), { pet: { stageIndex: 2 } }).level, 10); // the stage's own level
  });
});

describe('PR status', () => {
  const { statusOf } = require('../src/main/game/pull-requests');
  const kind = (p) => statusOf(p).kind;

  test('most urgent first: changes, merge conflicts, failing checks, ready, checks running, else needs review', () => {
    assert.equal(kind({ reviewDecision: 'CHANGES_REQUESTED', ci: 'FAILURE', mergeable: 'CONFLICTING' }), 'changes');
    assert.equal(kind({ reviewDecision: 'REVIEW_REQUIRED', ci: 'FAILURE', mergeable: 'CONFLICTING' }), 'conflicts');
    assert.equal(kind({ reviewDecision: 'APPROVED', ci: 'SUCCESS', mergeable: 'CONFLICTING' }), 'conflicts');
    assert.equal(kind({ reviewDecision: 'APPROVED', ci: 'SUCCESS', mergeable: 'MERGEABLE' }), 'ready');
    assert.equal(
      kind({ reviewDecision: 'APPROVED', ci: 'SUCCESS', mergeable: 'UNKNOWN' }),
      'ready',
      'not worked out yet',
    );
    assert.equal(kind({ reviewDecision: 'APPROVED', ci: 'FAILURE' }), 'failing');
    assert.equal(kind({ reviewDecision: 'REVIEW_REQUIRED', ci: 'ERROR' }), 'failing');
    assert.equal(kind({ reviewDecision: 'APPROVED', ci: 'PENDING' }), 'ready');
    assert.equal(kind({ reviewDecision: null, ci: 'PENDING' }), 'running');
    assert.equal(kind({ reviewDecision: 'REVIEW_REQUIRED', ci: 'SUCCESS' }), 'review');
    assert.equal(kind({ reviewDecision: null, ci: null }), 'review');
  });

  test('the PR view carries the status and the size name; a merged PR has no status', () => {
    const open = status(activity({}, { prs: [pr({ lines: 30, ci: 'FAILURE' })] })).prs.waiting[0];
    assert.deepEqual([open.status.kind, open.sizeName], ['failing', 'Small']);
    const merged = status(activity({}, { prs: [pr({ state: 'MERGED', mergedAt: hoursAgo(1) })] })).prs.mergedToday[0];
    assert.equal(merged.status, null);
  });
});

describe('PR lists', () => {
  const lists = (prs) => status(activity({}, { prs })).prs;

  test('waiting: open, not draft, not approved, oldest first', () => {
    const a = pr({ id: 'a', createdAt: daysAgo(1) });
    const b = pr({ id: 'b', createdAt: daysAgo(4), reviewDecision: 'CHANGES_REQUESTED' });
    const draft = pr({ id: 'd', isDraft: true });
    const approved = pr({ id: 'p', reviewDecision: 'APPROVED' });
    const { waiting, approved: ok } = lists([a, draft, b, approved]);
    assert.deepEqual(
      waiting.map((p) => p.id),
      ['b', 'a'],
    );
    assert.deepEqual(
      ok.map((p) => p.id),
      ['p'],
    );
  });

  test('mergedToday: merged since local midnight, with the merge bonus', () => {
    const today = pr({ id: 't', state: 'MERGED', mergedAt: new Date(2026, 5, 15, 8).toISOString() });
    const yesterday = pr({ id: 'y', state: 'MERGED', mergedAt: new Date(2026, 5, 14, 23, 59).toISOString() });
    const { mergedToday } = lists([today, yesterday]);
    assert.deepEqual(
      mergedToday.map((p) => [p.id, p.xp]),
      [['t', WEIGHTS.merges]],
    );
  });

  test('a PR view carries repo, size, XP and age', () => {
    const prs = [pr({ repo: 'webflow/app-web', lines: 250, createdAt: daysAgo(3) })];
    const [view] = computeStatus(stateOf(activity({}, { prs }), pet(), ['webflow/app-web']), NOON).prs.waiting;
    assert.equal(view.repo, 'app-web');
    assert.equal(view.fullRepo, 'webflow/app-web');
    assert.equal(view.size, 'M');
    assert.equal(view.xp, 20);
    assert.equal(view.ageDays, 3);
    for (const key of ['id', 'title', 'number', 'url', 'createdAt', 'mergedAt']) assert.ok(key in view, key);
  });

  test('PRs of repos no longer selected are not shown', () => {
    assert.deepEqual(lists([pr({ repo: 'other/x' })]).waiting, []);
  });
});

describe('time off', () => {
  const withTimeOff = (timeOff, acts = activity()) =>
    computeStatus({ ...stateOf(acts, pet(undefined)), timeOff }, NOON);

  test('once it is over, the status says it is not on', () => {
    const over = withTimeOff([{ from: toDay(daysAgo(10)), to: toDay(daysAgo(3)) }]);
    assert.deepEqual(over.timeOff, { active: false, since: null, backOn: null });
  });

  test('the status says whether time off is on, since when and when it ends', () => {
    const view = withTimeOff([{ from: toDay(daysAgo(2)), to: toDay(addDays(toDay(NOON), 3)) }]).timeOff;
    assert.deepEqual(view, { active: true, since: toDay(daysAgo(2)), backOn: toDay(addDays(toDay(NOON), 4)) });
    assert.deepEqual(status(activity()).timeOff, { active: false, since: null, backOn: null });
  });

  test('the streak and the streak achievements wait through the time off', () => {
    // NOON is Monday 2026-06-15: active Wed 10 and Thu 11, time off Fri 12 to Sun 14 (the weekend was free anyway),
    // nothing yet today. A free Friday would have broken the streak without it.
    const days = { '2026-06-10': day({ reviews: 1 }), '2026-06-11': day({ reviews: 1 }) };
    assert.equal(computeStatus(stateOf(activity(days), pet(undefined)), NOON).streak, 0);
    const kept = computeStatus(
      { ...stateOf(activity(days), pet(undefined)), timeOff: [{ from: '2026-06-12', to: '2026-06-14' }] },
      NOON,
    );
    assert.equal(kept.streak, 2);
  });
});

describe('mood', () => {
  const regular = (weekly = 100) => ({
    [toDay(daysAgo(20))]: day({ reviews: 1 }),
    [toDay(daysAgo(10))]: day({ reviews: weekly / 10 }),
  });
  const moodOf = (acts, now = NOON) => status(acts, {}, now);

  test('the pet is never anxious: a PR that has waited for days changes nothing', () => {
    const waiting = [pr({ createdAt: daysAgo(30) }), pr({ createdAt: daysAgo(9) })];
    const s = moodOf(activity({}, { prs: waiting }));
    assert.deepEqual([s.mood, s.moodLabel, s.moodReason], ['neutral', 'Neutral', null]);
  });

  test('happy after a recent merge, and after a strong week', () => {
    const merged = pr({ state: 'MERGED', mergedAt: hoursAgo(MOOD.happyMergeHours - 1), createdAt: daysAgo(1) });
    const s = moodOf(activity(regular(), { prs: [merged] }));
    assert.equal(s.mood, 'happy');
    assert.equal(s.moodLabel, 'Happy');
    assert.equal(s.moodReason, '1 PR merged recently');
    const old = pr({ state: 'MERGED', mergedAt: hoursAgo(MOOD.happyMergeHours + 1) });
    assert.notEqual(moodOf(activity(regular(), { prs: [old] })).moodReason, '1 PR merged recently');

    const strong = { ...regular(70), [toDay(daysAgo(1))]: day({ reviews: 10 }) }; // baseline 70/wk -> week 100+
    assert.deepEqual([moodOf(activity(strong)).mood, moodOf(activity(strong)).moodReason], ['happy', 'A strong week']);
  });

  test('neutral otherwise, with no reason (quiet weeks and nights are not moods)', () => {
    const s = moodOf(activity({ ...regular(100), [toDay(daysAgo(2))]: day({ reviews: 5 }) }));
    assert.deepEqual([s.mood, s.moodLabel, s.moodReason], ['neutral', 'Neutral', null]);
    const quiet = { [toDay(daysAgo(25))]: day({ reviews: 20 }) }; // plenty of history, nothing this week
    assert.equal(moodOf(activity(quiet)).mood, 'neutral');
    assert.equal(moodOf(activity(quiet), new Date(2026, 5, 15, 3)).mood, 'neutral'); // 3 AM
  });

  test('light and heavy users get the same mood for the same relative effort', () => {
    const history = (reviewsPerDay) =>
      Object.fromEntries(
        Array.from({ length: 28 }, (_, i) => [addDays('2026-06-15', -i), day({ reviews: reviewsPerDay })]),
      );
    assert.equal(moodOf(activity(history(1))).baseline, 70);
    assert.equal(moodOf(activity(history(8))).baseline, 560);
    assert.equal(moodOf(activity(history(1))).mood, moodOf(activity(history(8))).mood);
    assert.ok(BASELINE.floorWeekly <= 70);
  });
});
