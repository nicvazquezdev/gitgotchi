const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { achievementProgress, groupAchievements } = require('../src/main/game/achievements');
const { ACHIEVEMENTS } = require('../src/main/game/catalog');

// The renderer modules are ES modules; Node detects that and loads them.
const view = () => import(path.join(__dirname, '../src/renderer/profile/achievements-view.js'));
const art = () => import(path.join(__dirname, '../src/renderer/shared/pixel-art.js'));

const day = (counts = {}) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, commits: 0, issues: 0, ...counts });
const groups = (days = {}, stored = {}) => groupAchievements(achievementProgress({ days, stored }));

test('nextUp: the most complete first, one step per family, smallest goals first when nothing is done', async () => {
  const { nextUp } = await view();
  // One active day with 7 reviews, 3 merges and 1 PR: review-10 is at 70%, the 3-day streak at 33% (1 day),
  // merge-10 at 30% and pr-10 at 10%.
  const days = { '2026-03-02': day({ reviews: 7, merges: 3, prs: 1 }) };
  const next = nextUp(groups(days));
  assert.deepEqual(
    next.map((a) => a.id),
    ['review-10', 'streak-3', 'merge-10'],
  );
  assert.equal(new Set(next.map((a) => a.metric)).size, next.length); // never two steps of one family

  const fresh = nextUp(groups());
  assert.ok(fresh.every((a) => a.target === 1)); // "start here": the one-time goals
  assert.equal(fresh.length, 3);
});

test('nextUp skips what is unlocked, takes the count asked for, and is empty when everything is done', async () => {
  const { nextUp } = await view();
  const everything = groups({}, Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, '2026-03-02'])));
  assert.deepEqual(nextUp(everything), []);
  assert.equal(nextUp(groups(), 5).length, 5);
  assert.ok(nextUp(groups({ '2026-03-02': day({ reviews: 10 }) })).every((a) => !a.unlockedAt));
});

test('progress texts: "17 / 50 reviews", "33 to go", nothing to count for one-time goals', async () => {
  const { countText, toGo } = await view();
  const item = { value: 17, target: 50, unit: 'reviews' };
  assert.equal(countText(item), '17 / 50 reviews');
  assert.equal(toGo(item), '33 to go');
  assert.equal(countText({ value: 0, target: 1, unit: 'PRs' }), null);
  assert.equal(toGo({ value: 0, target: 1, unit: 'PRs' }), '1 to go');
});

test('filledBlocks: none without progress, at least one as soon as there is some, all when done', async () => {
  const { filledBlocks } = await view();
  assert.equal(filledBlocks(0, 50, 10), 0);
  assert.equal(filledBlocks(1, 50, 10), 1);
  assert.equal(filledBlocks(25, 50, 10), 5);
  assert.equal(filledBlocks(49, 50, 10), 9);
  assert.equal(filledBlocks(50, 50, 10), 10);
  assert.equal(filledBlocks(80, 50, 10), 10); // never past the end
});

test('daysSince counts calendar days, across months; dayLabel adds the year only when it is not this one', async () => {
  const { daysSince, dayLabel } = await view();
  const now = new Date(2026, 2, 2, 23, 30); // Mar 2, 2026, late
  assert.equal(daysSince('2026-03-02', now), 0);
  assert.equal(daysSince('2026-03-01', now), 1);
  assert.equal(daysSince('2026-02-27', now), 3); // Feb has 28 days
  assert.equal(dayLabel('2026-03-02', now), 'Mar 2');
  assert.equal(dayLabel('2025-12-31', now), 'Dec 31, 2025');
});

test('applyFilter keeps the matching items and drops the groups left empty', async () => {
  const { applyFilter } = await view();
  const all = groups({ '2026-03-02': day({ prs: 1, reviews: 1 }) }).groups;
  const unlocked = applyFilter(all, 'unlocked');
  assert.deepEqual(
    unlocked
      .flatMap((g) => g.items)
      .map((a) => a.id)
      .sort(),
    ['first-pr', 'first-review'],
  );
  assert.deepEqual(unlocked.map((g) => g.id).sort(), ['prs', 'reviews']);
  const locked = applyFilter(all, 'locked');
  assert.equal(locked.flatMap((g) => g.items).length, ACHIEVEMENTS.length - 2);
  assert.ok(locked.every((g) => g.items.length > 0));
  assert.equal(applyFilter(all, 'all').flatMap((g) => g.items).length, ACHIEVEMENTS.length);
  assert.equal(applyFilter(all, 'whatever').flatMap((g) => g.items).length, ACHIEVEMENTS.length);
});

test('pixel art: every icon of the catalog has a glyph, 10 x 10', async () => {
  const { GLYPH_NAMES, medalRows } = await art();
  for (const icon of new Set(ACHIEVEMENTS.map((a) => a.icon))) assert.ok(GLYPH_NAMES.includes(icon), icon);
  for (const icon of GLYPH_NAMES) {
    const rows = medalRows(icon);
    assert.equal(rows.length, 20);
    assert.ok(rows.every((row) => row.length === 20));
  }
});

test('pixel art: the medal is a round coin with the glyph in ink at the center', async () => {
  const { medalRows } = await art();
  const rows = medalRows('bolt');
  assert.equal(rows[0][0], '.'); // round: the corners are empty
  assert.equal(rows[10][0], 'g'); // the outline touches the middle of each side
  assert.ok(rows[1].includes('l') && rows[18].includes('d')); // light on the top, shade at the bottom
  const ink = rows
    .slice(5, 15)
    .join('')
    .split('')
    .filter((c) => c === 'g').length;
  assert.ok(ink > 10); // the glyph
});

test('pixel art: paths merge horizontal runs of one character', async () => {
  const { pixelPaths } = await art();
  assert.deepEqual(pixelPaths(['.mm.', 'm..m']), { m: 'M1 0h2v1h-2zM0 1h1v1h-1zM3 1h1v1h-1z' });
  assert.deepEqual(pixelPaths(['ml']), { m: 'M0 0h1v1h-1z', l: 'M1 0h1v1h-1z' });
  assert.deepEqual(pixelPaths(['..']), {});
});

test('pixel art: the bitmap font draws digits and the slash, 7 rows tall, one column apart', async () => {
  const { digitRows } = await art();
  const rows = digitRows('7/20');
  assert.equal(rows.length, 7);
  assert.ok(rows.every((row) => row.length === 4 * 5 + 3));
  assert.deepEqual(digitRows('x'), digitRows('0')); // unknown characters draw as 0
  for (const digit of '0123456789/') assert.ok(digitRows(digit).join('').includes('i'), digit);
});
