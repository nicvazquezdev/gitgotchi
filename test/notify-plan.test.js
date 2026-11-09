const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { planNotifications, COOLDOWN_MS, MAX_TITLES } = require('../src/main/notify-plan');

const item = (kind, n, extra = {}) => ({
  kind,
  id: `pr${n}`,
  title: `Title ${n}`,
  repo: 'acme/web-app',
  number: 100 + n,
  url: `https://github.com/acme/web-app/pull/${100 + n}`,
  author: null,
  via: null,
  ...extra,
});
const NOW = 1_000_000_000;

describe('planNotifications', () => {
  test('one thing gets its own notification: what, where, who asked, and clicking opens the PR', () => {
    const { notifications } = planNotifications([item('reviewRequested', 1, { author: 'ana', via: 'acme/code' })], {
      now: NOW,
    });
    assert.deepEqual(notifications, [
      {
        title: 'Review requested',
        subtitle: 'web-app #101 · ana · via code',
        body: 'Title 1',
        silent: false,
        target: { type: 'pr', url: 'https://github.com/acme/web-app/pull/101' },
      },
    ]);
  });

  test('each kind reads on its own, and good news is silent', () => {
    const titles = [
      'reviewRequested',
      'changesRequested',
      'checksFailed',
      'mergeConflicts',
      'readyToMerge',
      'approved',
    ].map((kind) => planNotifications([item(kind, 1)], { now: NOW }).notifications[0]);
    assert.deepEqual(
      titles.map((n) => n.title),
      ['Review requested', 'Changes requested', 'Checks failed', 'Merge conflicts', 'Ready to merge', 'PR approved'],
    );
    assert.deepEqual(
      titles.map((n) => n.silent),
      [false, false, false, false, true, true],
    );
  });

  test('several of one kind are summed up in one notification; clicking opens the popover', () => {
    const { notifications } = planNotifications(
      [1, 2, 3, 4].map((n) => item('reviewRequested', n)),
      { now: NOW },
    );
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].title, '4 review requests');
    assert.equal(notifications[0].body, `Title 1\nTitle 2\n+${4 - MAX_TITLES} more`);
    assert.deepEqual(notifications[0].target, { type: 'popover' });
    assert.equal(notifications[0].subtitle, undefined);

    const two = planNotifications([item('checksFailed', 1), item('checksFailed', 2)], { now: NOW }).notifications[0];
    assert.equal(two.title, 'Checks failed on 2 PRs');
    assert.equal(two.body, 'Title 1\nTitle 2', 'no "+0 more"');
  });

  test('different kinds in the same batch give one notification each, most urgent first', () => {
    const { notifications } = planNotifications(
      [item('approved', 1), item('checksFailed', 2), item('reviewRequested', 3)],
      { now: NOW },
    );
    assert.deepEqual(
      notifications.map((n) => n.title),
      ['Review requested', 'Checks failed', 'PR approved'],
    );
  });

  test('the same thing on the same PR is not announced again inside the cooldown, and is after it', () => {
    const recent = new Map([['checksFailed:pr1', NOW - 60_000]]);
    assert.deepEqual(planNotifications([item('checksFailed', 1)], { recent, now: NOW }).notifications, []);
    assert.equal(
      planNotifications([item('checksFailed', 1)], {
        recent: new Map([['checksFailed:pr1', NOW - COOLDOWN_MS]]),
        now: NOW,
      }).notifications.length,
      1,
    );
    // Another PR, or another kind on the same PR, is not covered by it.
    assert.equal(
      planNotifications([item('checksFailed', 2), item('approved', 1)], { recent, now: NOW }).notifications.length,
      2,
    );
  });

  test('a repeated item in one batch counts once; the keys of what was covered are returned', () => {
    const result = planNotifications([item('approved', 1), item('approved', 1), item('checksFailed', 2)], { now: NOW });
    assert.deepEqual(result.shown.sort(), ['approved:pr1', 'checksFailed:pr2']);
    assert.equal(result.notifications.find((n) => n.title === 'PR approved').target.type, 'pr', 'one PR, not two');
    assert.deepEqual(
      planNotifications([item('approved', 1)], { recent: new Map([['approved:pr1', NOW]]), now: NOW }).shown,
      [],
    );
  });

  test('unknown kinds and an empty batch give nothing', () => {
    assert.deepEqual(planNotifications([item('merged', 1)], { now: NOW }), { notifications: [], shown: [] });
    assert.deepEqual(planNotifications([], { now: NOW }), { notifications: [], shown: [] });
  });

  test('the team is named without its organization, and a request with no author or team has just the PR', () => {
    const plain = planNotifications([item('reviewRequested', 1)], { now: NOW }).notifications[0];
    assert.equal(plain.subtitle, 'web-app #101');
    const team = planNotifications([item('reviewRequested', 1, { via: 'code' })], { now: NOW }).notifications[0];
    assert.equal(team.subtitle, 'web-app #101 · via code');
  });
});
