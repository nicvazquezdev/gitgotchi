const test = require('node:test');
const assert = require('node:assert/strict');
const { diffDays, mergeDays } = require('../src/main/game/engine');

const day = (o = {}) => ({ prs: 0, prsXp: 0, reviews: 0, merges: 0, ...o });

test('empty histories produce no activity', () => {
  assert.deepEqual(diffDays({}, {}), {});
});

test('a new day counts all its activity', () => {
  assert.deepEqual(diffDays({}, { '2026-01-02': day({ merges: 1, reviews: 2 }) }), { merges: 1, reviews: 2 });
});

test('increased counts only report the difference', () => {
  const old = { '2026-01-02': day({ reviews: 2 }) };
  assert.deepEqual(diffDays(old, { '2026-01-02': day({ reviews: 5 }) }), { reviews: 3 });
});

test('unchanged history produces no activity', () => {
  const days = { '2026-01-02': day({ reviews: 2, prs: 1 }) };
  assert.deepEqual(diffDays(days, structuredClone(days)), {});
});

test('decreased counts never produce negatives', () => {
  const old = { '2026-01-02': day({ reviews: 5, prs: 1 }) };
  assert.deepEqual(diffDays(old, { '2026-01-02': day({ reviews: 2, prs: 1 }) }), {});
});

test('sums the same kind across days', () => {
  const old = { '2026-01-01': day({ prs: 1 }) };
  const next = { '2026-01-01': day({ prs: 2 }), '2026-01-02': day({ prs: 1 }) };
  assert.deepEqual(diffDays(old, next), { prs: 2 });
});

test('XP-only changes and old kinds are not activity', () => {
  const old = { '2026-01-02': day({ prs: 1, prsXp: 5 }) };
  assert.deepEqual(diffDays(old, { '2026-01-02': day({ prs: 1, prsXp: 30, pushes: 9, comments: 4 }) }), {});
});

test('a lower fresh count merged by max yields no reaction', () => {
  const old = { '2026-01-02': day({ merges: 3 }) };
  const merged = mergeDays(old, { '2026-01-02': day({ merges: 1 }) });
  assert.deepEqual(diffDays(old, merged), {});
});
