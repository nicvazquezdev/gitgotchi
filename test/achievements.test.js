const test = require('node:test');
const assert = require('node:assert/strict');
const { achievementProgress, groupAchievements, unlockedOf } = require('../src/main/game/achievements');
const { computeStatus } = require('../src/main/game/engine');
const { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } = require('../src/main/game/catalog');

const day = (counts = {}) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, commits: 0, issues: 0, ...counts });
const progress = (input) => Object.fromEntries(achievementProgress(input).map((a) => [a.id, a]));
const unlocked = (input) =>
  achievementProgress(input)
    .filter((a) => a.unlockedAt)
    .map((a) => a.id);

test('the catalog is consistent: unique ids, known groups and metrics, quickMerges target 1', () => {
  const ids = ACHIEVEMENTS.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
  const groups = new Set(ACHIEVEMENT_GROUPS.map((g) => g.id));
  const metrics = new Set(['prs', 'reviews', 'merges', 'commits', 'issues', 'streak', 'fullDays', 'quickMerges']);
  for (const a of ACHIEVEMENTS) {
    assert.ok(groups.has(a.group), `${a.id}: group`);
    assert.ok(metrics.has(a.metric), `${a.id}: metric`);
    assert.ok(Number.isInteger(a.target) && a.target > 0, `${a.id}: target`);
    assert.ok(a.name && a.description && a.icon, `${a.id}: texts and icon`);
  }
  assert.ok(ACHIEVEMENTS.filter((a) => a.metric === 'quickMerges').every((a) => a.target === 1));
});

test('nothing is unlocked without activity', () => {
  assert.deepEqual(unlocked({ days: {} }), []);
});

test('counts unlock on the day the total reached the target; locked ones show their progress', () => {
  const days = {
    '2026-03-02': day({ reviews: 4 }),
    '2026-03-03': day({ reviews: 3 }),
    '2026-03-04': day({ reviews: 5 }),
  };
  const p = progress({ days });
  assert.equal(p['first-review'].unlockedAt, '2026-03-02');
  assert.equal(p['review-10'].unlockedAt, '2026-03-04'); // 4 + 3 + 5: reached with the last day
  assert.equal(p['review-50'].unlockedAt, null);
  assert.deepEqual([p['review-50'].value, p['review-50'].target, p['review-50'].unit], [12, 50, 'reviews']);
  assert.equal(p['review-10'].value, 10); // never past the target
});

test('each ledger kind feeds its own achievements', () => {
  const days = { '2026-03-02': day({ prs: 1, merges: 1, issues: 1, commits: 100 }) };
  assert.deepEqual(unlocked({ days }).sort(), ['commit-100', 'first-issue', 'first-merge', 'first-pr']);
});

test('streak achievements follow the weekend rule', () => {
  // Thu 5, Fri 6, (weekend off), Mon 9: three days in a row
  const days = {
    '2026-03-05': day({ reviews: 1 }),
    '2026-03-06': day({ reviews: 1 }),
    '2026-03-09': day({ reviews: 1 }),
  };
  const p = progress({ days });
  assert.equal(p['streak-3'].unlockedAt, '2026-03-09');
  assert.deepEqual([p['streak-5'].value, p['streak-5'].unit], [3, 'days']);
  assert.equal(p['streak-5'].unlockedAt, null);
});

test('a missed weekday restarts the streak, the best run still counts', () => {
  const days = {
    '2026-03-02': day({ reviews: 1 }),
    '2026-03-03': day({ reviews: 1 }),
    '2026-03-04': day({ reviews: 1 }),
    '2026-03-06': day({ reviews: 1 }), // Thursday the 5th was missed
  };
  const p = progress({ days });
  assert.equal(p['streak-3'].unlockedAt, '2026-03-04');
  assert.equal(p['streak-5'].value, 3);
});

test('full cycle needs a PR opened, a review and a merge on the same day', () => {
  const split = { '2026-03-02': day({ prs: 1, reviews: 1 }), '2026-03-03': day({ merges: 1 }) };
  assert.equal(progress({ days: split })['full-cycle'].unlockedAt, null);
  const same = { ...split, '2026-03-04': day({ prs: 1, reviews: 2, merges: 1 }) };
  assert.equal(progress({ days: same })['full-cycle'].unlockedAt, '2026-03-04');
});

const pr = (extra) => ({
  state: 'MERGED',
  createdAt: '2026-03-02T10:00:00Z',
  mergedAt: '2026-03-02T10:30:00Z',
  ...extra,
});

test('speed run: a PR merged within the hour, from the stored PR list', () => {
  const at = (prs, since = '2026-03-01') => progress({ days: {}, prs, since })['quick-merge'].unlockedAt;
  assert.equal(at([pr()]), '2026-03-02');
  assert.equal(at([pr({ mergedAt: '2026-03-02T11:00:00Z' })]), '2026-03-02'); // exactly one hour
  assert.equal(at([pr({ mergedAt: '2026-03-02T11:01:00Z' })]), null);
  assert.equal(at([pr({ state: 'OPEN', mergedAt: null })]), null);
  assert.equal(at([pr()], '2026-03-03'), null); // merged before the pet was born
});

test('a recorded achievement stays unlocked on its recorded day, whatever the history says now', () => {
  const p = progress({ days: {}, stored: { 'review-50': '2026-02-10' } });
  assert.deepEqual([p['review-50'].unlockedAt, p['review-50'].value], ['2026-02-10', 50]);
  const kept = progress({
    days: { '2026-03-02': day({ reviews: 1 }) },
    stored: { 'first-review': '2026-02-01' },
  });
  assert.equal(kept['first-review'].unlockedAt, '2026-02-01'); // not the day the ledger now shows
});

test('an id that is no longer in the catalog is ignored', () => {
  assert.equal(achievementProgress({ days: {}, stored: { gone: '2026-01-01' } }).length, ACHIEVEMENTS.length);
});

test('groupAchievements keeps the catalog order and counts what is unlocked', () => {
  const view = groupAchievements(achievementProgress({ days: { '2026-03-02': day({ prs: 1, reviews: 1 }) } }));
  assert.deepEqual(
    view.groups.map((g) => g.id),
    ACHIEVEMENT_GROUPS.map((g) => g.id),
  );
  assert.equal(view.total, ACHIEVEMENTS.length);
  assert.equal(view.unlocked, 2);
  assert.deepEqual(
    unlockedOf(view)
      .map((a) => a.id)
      .sort(),
    ['first-pr', 'first-review'],
  );
  assert.equal(view.groups.find((g) => g.id === 'streaks').note, 'Weekends never break a streak');
  assert.equal(
    view.groups.reduce((n, g) => n + g.items.length, 0),
    ACHIEVEMENTS.length,
  );
});

test('the pet status carries the achievements, counted since its birth day only', () => {
  const pet = { name: 'Pixel', species: 'phoenix', bornAt: new Date(2026, 2, 5, 12).toISOString() };
  const days = { '2026-03-01': day({ prs: 3, reviews: 9 }), '2026-03-06': day({ reviews: 1 }) };
  const now = new Date(2026, 2, 7, 12);
  const status = computeStatus({ pet, activity: { days, prs: [] }, repos: [] }, now);
  assert.deepEqual(
    unlockedOf(status.achievements).map((a) => a.id),
    ['first-review'],
  ); // not the PRs before birth
  const withStored = computeStatus(
    { pet: { ...pet, achievements: { 'first-pr': '2026-03-06' } }, activity: { days, prs: [] } },
    now,
  );
  assert.deepEqual(
    unlockedOf(withStored.achievements)
      .map((a) => a.id)
      .sort(),
    ['first-pr', 'first-review'],
  );
});
