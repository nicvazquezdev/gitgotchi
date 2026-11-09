const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { xpLog } = require('../src/main/game/xp-log');
const { emptyDay, dayXp } = require('../src/main/game/stats');

const NOW = new Date(2026, 5, 15, 12, 0, 0); // Monday 2026-06-15
const day = (over) => ({ ...emptyDay(), ...over });

describe('xpLog', () => {
  test('lists the days with XP, newest first, with why each one earned what it did', () => {
    const log = xpLog(
      {
        '2026-06-13': day({ commits: 4 }),
        '2026-06-15': day({ prs: 2, prsXp: 30, reviews: 3, fastReviews: 1, merges: 1 }),
        '2026-06-14': day(),
      },
      NOW,
    );
    assert.deepEqual(
      log.map((entry) => entry.day),
      ['2026-06-15', '2026-06-13'],
      'a day without XP is not listed',
    );
    assert.deepEqual(log[0].lines, [
      { kind: 'prs', count: 2, xp: 30 },
      { kind: 'merges', count: 1, xp: 15 },
      { kind: 'reviews', count: 3, xp: 30 },
      { kind: 'fastReviews', count: 1, xp: 5 },
    ]);
    assert.deepEqual(log[1].lines, [{ kind: 'commits', count: 4, xp: 4, capped: false }]);
  });

  test('the lines of a day add up to its XP', () => {
    const busy = day({ prs: 1, prsXp: 20, reviews: 2, fastReviews: 2, merges: 3, issues: 1, commits: 25 });
    const [entry] = xpLog({ '2026-06-15': busy }, NOW);
    assert.equal(entry.xp, dayXp(busy));
    assert.equal(
      entry.lines.reduce((sum, line) => sum + line.xp, 0),
      entry.xp,
    );
  });

  test('commits past the daily cap say so, and only the capped XP is counted', () => {
    const [entry] = xpLog({ '2026-06-15': day({ commits: 14 }) }, NOW);
    assert.deepEqual(entry.lines, [{ kind: 'commits', count: 14, xp: 10, capped: true }]);
  });

  test('days after today are left out, and the log keeps the newest `limit` days', () => {
    const days = {
      '2026-06-16': day({ issues: 1 }),
      '2026-06-15': day({ issues: 1 }),
      '2026-06-14': day({ issues: 1 }),
      '2026-06-13': day({ issues: 1 }),
    };
    assert.deepEqual(
      xpLog(days, NOW, 2).map((entry) => entry.day),
      ['2026-06-15', '2026-06-14'],
    );
  });

  test('no activity, no log', () => {
    assert.deepEqual(xpLog({}, NOW), []);
  });
});
