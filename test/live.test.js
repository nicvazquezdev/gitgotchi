const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { repoFromRemoteUrl, originUrl, lastLine, isPushReflogLine } = require('../src/main/live/git-remotes');
const { diffPullRequests } = require('../src/main/live/pr-diff');
const { addCredits, subtractCredits } = require('../src/main/live/credits');

test('repoFromRemoteUrl: https, ssh, .git suffix, case', () => {
  assert.equal(repoFromRemoteUrl('https://github.com/webflow/gitgotchi.git'), 'webflow/gitgotchi');
  assert.equal(repoFromRemoteUrl('https://github.com/webflow/gitgotchi'), 'webflow/gitgotchi');
  assert.equal(repoFromRemoteUrl('https://user:tok@github.com/Webflow/GitGotchi.git'), 'Webflow/GitGotchi');
  assert.equal(repoFromRemoteUrl('git@github.com:webflow/gitgotchi.git'), 'webflow/gitgotchi');
  assert.equal(repoFromRemoteUrl('ssh://git@github.com/webflow/gitgotchi.git'), 'webflow/gitgotchi');
  assert.equal(repoFromRemoteUrl('git@github.com:webflow/my.repo.git'), 'webflow/my.repo');
  assert.equal(repoFromRemoteUrl('https://gitlab.com/a/b.git'), null);
  assert.equal(repoFromRemoteUrl(null), null);
});

test('originUrl reads the origin remote only', () => {
  const config = `[core]\n\tbare = false\n[remote "upstream"]\n\turl = git@github.com:up/stream.git\n[remote "origin"]\n\turl = git@github.com:me/mine.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
  assert.equal(originUrl(config), 'git@github.com:me/mine.git');
  assert.equal(originUrl('[core]\n\tbare = false\n'), null);
});

test('isPushReflogLine: only `update by push`', () => {
  const head =
    '0000000000000000000000000000000000000000 1111111111111111111111111111111111111111 A <a@b.c> 1700000000 +0100\t';
  assert.equal(isPushReflogLine(head + 'update by push'), true);
  assert.equal(isPushReflogLine(head + 'fetch origin: fast-forward'), false);
  assert.equal(isPushReflogLine(head + 'pull: fast-forward'), false);
  assert.equal(isPushReflogLine(''), false);
});

test('lastLine ignores trailing newline', () => {
  assert.equal(lastLine('a\nb\n'), 'b');
  assert.equal(lastLine(''), '');
});

const pr = (id, state, extra = {}) => ({
  id,
  state,
  repo: 'webflow/app',
  createdAt: '2020-01-01T00:00:00Z',
  mergedAt: null,
  ...extra,
});
const NOW = Date.parse('2026-01-01T12:00:00Z');
const REPOS = ['Webflow/App'];

test('diffPullRequests: first snapshot is a baseline', () => {
  const { snapshot, delta } = diffPullRequests(null, [pr('1', 'MERGED')], REPOS, NOW);
  assert.deepEqual(delta, {});
  assert.deepEqual(snapshot.states, { 1: 'MERGED' });
});

test('diffPullRequests: open -> merged counts a merge, once', () => {
  const { snapshot } = diffPullRequests(null, [pr('1', 'OPEN')], REPOS, NOW);
  const merged = [pr('1', 'MERGED', { mergedAt: '2026-01-01T12:00:05Z' })];
  const next = diffPullRequests(snapshot, merged, REPOS, NOW + 10_000);
  assert.deepEqual(next.delta, { merges: 1 });
  assert.deepEqual(diffPullRequests(next.snapshot, merged, REPOS, NOW + 20_000).delta, {});
});

test('diffPullRequests: new recent open PR counts, old one entering the window does not', () => {
  const { snapshot } = diffPullRequests(null, [], REPOS, NOW);
  const fresh = pr('2', 'OPEN', { createdAt: '2026-01-01T12:00:03Z' });
  assert.deepEqual(diffPullRequests(snapshot, [fresh], REPOS, NOW + 10_000).delta, { prs: 1 });
  assert.deepEqual(diffPullRequests(snapshot, [pr('3', 'OPEN')], REPOS, NOW + 10_000).delta, {});
  assert.deepEqual(
    diffPullRequests(snapshot, [pr('4', 'MERGED', { mergedAt: '2025-12-01T00:00:00Z' })], REPOS, NOW).delta,
    {},
  );
});

test('diffPullRequests: unknown PR merged since the last check counts', () => {
  const { snapshot } = diffPullRequests(null, [], REPOS, NOW);
  const quick = pr('5', 'MERGED', { mergedAt: '2026-01-01T12:00:04Z' });
  assert.deepEqual(diffPullRequests(snapshot, [quick], REPOS, NOW + 10_000).delta, { merges: 1 });
});

test('diffPullRequests: unselected repos are ignored', () => {
  const { snapshot } = diffPullRequests(null, [pr('1', 'OPEN', { repo: 'other/x' })], REPOS, NOW);
  assert.deepEqual(snapshot.states, {});
  const merged = pr('1', 'MERGED', { repo: 'other/x', mergedAt: '2026-01-01T12:00:05Z' });
  assert.deepEqual(diffPullRequests(snapshot, [merged], REPOS, NOW + 10_000).delta, {});
});

test('PrWatcher: reacts first, then hands over the fetched PRs', async () => {
  const { PrWatcher } = require('../src/main/live/pr-watcher');
  const calls = [];
  let prs = [pr('1', 'OPEN')];
  const watcher = new PrWatcher({
    powerMonitor: { on() {}, getSystemIdleTime: () => 0 },
    isEnabled: () => true,
    fetchPrs: async () => prs,
    getRepos: () => REPOS,
    onActivity: (delta) => calls.push(['activity', delta]),
    onPullRequests: (list) => calls.push(['prs', list.length]),
  });
  await watcher.check(); // baseline
  prs = [pr('1', 'MERGED', { mergedAt: new Date().toISOString() })];
  await watcher.check();
  assert.deepEqual(calls, [
    ['prs', 1],
    ['activity', { merges: 1 }],
    ['prs', 1],
  ]);
});

const TTL = 10 * 60 * 1000;

test('credits: subtracted from the Events diff', () => {
  const credits = addCredits([], { merges: 1, pushes: 1 }, 1000, TTL);
  const result = subtractCredits(credits, { merges: 1, pushes: 2, prs: 1 }, 2000, TTL);
  assert.deepEqual(result.delta, { pushes: 1, prs: 1 });
  assert.deepEqual(result.credits, []);
});

test('credits: unused credits are kept, extra credits do not go negative', () => {
  const credits = addCredits([], { merges: 2 }, 1000, TTL);
  const result = subtractCredits(credits, { merges: 1 }, 2000, TTL);
  assert.deepEqual(result.delta, {});
  assert.equal(result.credits.length, 1);
});

test('credits: expire after the TTL', () => {
  const credits = addCredits([], { merges: 1 }, 1000, TTL);
  assert.deepEqual(subtractCredits(credits, { merges: 1 }, 1000 + TTL, TTL).delta, { merges: 1 });
  assert.deepEqual(addCredits(credits, {}, 1000 + TTL, TTL), []);
});

test('diffPullRequests: an open PR that gets approved or gets changes requested is reported once (animation only)', () => {
  const open = (decision) => pr('1', 'OPEN', { reviewDecision: decision, createdAt: '2025-12-01T00:00:00Z' });
  const { snapshot } = diffPullRequests(null, [open(null)], REPOS, NOW);
  const approved = diffPullRequests(snapshot, [open('APPROVED')], REPOS, NOW + 10_000);
  assert.deepEqual(approved.delta, { approvals: 1 });
  assert.deepEqual(diffPullRequests(approved.snapshot, [open('APPROVED')], REPOS, NOW + 20_000).delta, {});

  const changes = diffPullRequests(approved.snapshot, [open('CHANGES_REQUESTED')], REPOS, NOW + 30_000);
  assert.deepEqual(changes.delta, { changesRequested: 1 });
  assert.deepEqual(diffPullRequests(changes.snapshot, [open('REVIEW_REQUIRED')], REPOS, NOW + 40_000).delta, {});
});

test('diffPullRequests: a PR entering the window with a decision already set is not news', () => {
  const { snapshot } = diffPullRequests(null, [], REPOS, NOW);
  const old = pr('1', 'OPEN', { reviewDecision: 'APPROVED', createdAt: '2025-12-01T00:00:00Z' });
  assert.deepEqual(diffPullRequests(snapshot, [old], REPOS, NOW + 10_000).delta, {});
});

describe('diffPullRequests: the animation-only reactions (no XP)', () => {
  const open = (extra = {}) =>
    pr('1', 'OPEN', { reviewDecision: null, ci: 'SUCCESS', createdAt: '2025-12-01T00:00:00Z', ...extra });
  const delta = (result) => result.delta;

  test('an approval, changes requested and failing checks', () => {
    const base = diffPullRequests(null, [open({ ci: 'PENDING' })], REPOS, NOW).snapshot;
    const approved = diffPullRequests(base, [open({ reviewDecision: 'APPROVED', ci: 'PENDING' })], REPOS, NOW + 10_000);
    assert.deepEqual(delta(approved), { approvals: 1 });

    const changes = diffPullRequests(
      base,
      [open({ reviewDecision: 'CHANGES_REQUESTED', ci: 'PENDING' })],
      REPOS,
      NOW + 10_000,
    );
    assert.deepEqual(delta(changes), { changesRequested: 1 });

    const red = diffPullRequests(base, [open({ ci: 'FAILURE' })], REPOS, NOW + 10_000);
    assert.deepEqual(delta(red), { checksFailed: 1 });
  });

  test('ready to merge: approved with green checks, whichever of the two comes last', () => {
    const at = (extra, snapshot, t) => diffPullRequests(snapshot, [open(extra)], REPOS, NOW + t);
    const base = diffPullRequests(null, [open({ ci: 'PENDING' })], REPOS, NOW).snapshot;

    // Approved first, the checks turn green later: the approval is one thing, being ready is another.
    let result = at({ reviewDecision: 'APPROVED', ci: 'PENDING' }, base, 10_000);
    assert.deepEqual(delta(result), { approvals: 1 });
    result = at({ reviewDecision: 'APPROVED', ci: 'SUCCESS' }, result.snapshot, 20_000);
    assert.deepEqual(delta(result), { readyToMerge: 1 });
    result = at({ reviewDecision: 'APPROVED', ci: 'SUCCESS' }, result.snapshot, 30_000);
    assert.deepEqual(delta(result), {}, 'still ready: nothing new');

    // Green first, approved later: both happen at once.
    const green = diffPullRequests(null, [open()], REPOS, NOW).snapshot;
    result = at({ reviewDecision: 'APPROVED', ci: 'SUCCESS' }, green, 10_000);
    assert.deepEqual(delta(result), { approvals: 1, readyToMerge: 1 });
  });

  test('ready to merge again after a new failure and a green re-run, and never without a green check', () => {
    const at = (extra, snapshot, t) => diffPullRequests(snapshot, [open(extra)], REPOS, NOW + t);
    const approved = { reviewDecision: 'APPROVED' };
    const pending = diffPullRequests(null, [open({ ...approved, ci: 'PENDING' })], REPOS, NOW).snapshot;
    let result = at({ ...approved, ci: 'SUCCESS' }, pending, 1);
    assert.deepEqual(delta(result), { readyToMerge: 1 });
    result = at({ ...approved, ci: 'FAILURE' }, result.snapshot, 10_000);
    assert.deepEqual(delta(result), { checksFailed: 1 });
    result = at({ ...approved, ci: 'SUCCESS' }, result.snapshot, 20_000);
    assert.deepEqual(delta(result), { readyToMerge: 1 });

    // No checks at all (ci is null): an approval, but not "ready".
    const none = diffPullRequests(null, [open({ ci: null })], REPOS, NOW).snapshot;
    assert.deepEqual(delta(at({ ...approved, ci: null }, none, 10_000)), { approvals: 1 });
  });

  test('failing checks count once per failure: going from pending or green to red, not red to red', () => {
    const at = (ci, snapshot, t) => diffPullRequests(snapshot, [open({ ci })], REPOS, NOW + t);
    let result = at('SUCCESS', diffPullRequests(null, [open()], REPOS, NOW).snapshot, 10_000);
    result = at('PENDING', result.snapshot, 20_000);
    assert.deepEqual(delta(result), {});
    result = at('FAILURE', result.snapshot, 30_000);
    assert.deepEqual(delta(result), { checksFailed: 1 });
    result = at('FAILURE', result.snapshot, 40_000);
    assert.deepEqual(delta(result), {}, 'still red: nothing new');
    result = at('ERROR', result.snapshot, 50_000);
    assert.deepEqual(delta(result), {}, 'FAILURE and ERROR are both red');
    result = at('PENDING', result.snapshot, 60_000); // a re-run
    result = at('ERROR', result.snapshot, 70_000);
    assert.deepEqual(delta(result), { checksFailed: 1 }, 'a new failure after a re-run counts again');
  });

  test('merge conflicts: once when a PR gets them, and GitHub still working it out (UNKNOWN) changes nothing', () => {
    const at = (mergeable, snapshot, t, extra = {}) =>
      diffPullRequests(snapshot, [open({ mergeable, ...extra })], REPOS, NOW + t);
    let result = at('MERGEABLE', diffPullRequests(null, [open({ mergeable: 'MERGEABLE' })], REPOS, NOW).snapshot, 1);
    assert.deepEqual(delta(result), {});
    result = at('UNKNOWN', result.snapshot, 10_000); // the base moved: not known yet
    assert.deepEqual(delta(result), {});
    result = at('CONFLICTING', result.snapshot, 20_000);
    assert.deepEqual(delta(result), { mergeConflicts: 1 });
    result = at('CONFLICTING', result.snapshot, 30_000);
    assert.deepEqual(delta(result), {}, 'still conflicted: nothing new');
    result = at('UNKNOWN', result.snapshot, 40_000); // recomputing: it is still what it was
    result = at('CONFLICTING', result.snapshot, 50_000);
    assert.deepEqual(delta(result), {}, 'the same conflict is not counted twice');
    result = at('MERGEABLE', result.snapshot, 60_000);
    result = at('CONFLICTING', result.snapshot, 70_000);
    assert.deepEqual(delta(result), { mergeConflicts: 1 }, 'fixed and conflicted again counts again');
  });

  test('a PR with conflicts is not ready to merge, and becomes ready when they are fixed', () => {
    const approved = { reviewDecision: 'APPROVED', ci: 'SUCCESS' };
    const at = (mergeable, snapshot, t) =>
      diffPullRequests(snapshot, [open({ ...approved, mergeable })], REPOS, NOW + t);
    const before = diffPullRequests(null, [open({ ci: 'SUCCESS', mergeable: 'CONFLICTING' })], REPOS, NOW).snapshot;
    let result = at('CONFLICTING', before, 10_000); // approved, green, but conflicted
    assert.deepEqual(delta(result), { approvals: 1 }, 'an approval, not "ready"');
    result = at('UNKNOWN', result.snapshot, 20_000);
    assert.deepEqual(delta(result), {}, 'not worked out yet: nothing');
    result = at('MERGEABLE', result.snapshot, 30_000); // the conflicts were fixed
    assert.deepEqual(delta(result), { readyToMerge: 1 });
    result = at('UNKNOWN', result.snapshot, 40_000); // the base moved and GitHub is recomputing
    result = at('MERGEABLE', result.snapshot, 50_000);
    assert.deepEqual(delta(result), {}, 'a recomputation is not a new ready');
  });

  test('nothing for a PR the app did not know, on the first look, or when it is not open', () => {
    assert.deepEqual(delta(diffPullRequests(null, [open({ ci: 'FAILURE' })], REPOS, NOW)), {});
    assert.deepEqual(delta(diffPullRequests(null, [open({ mergeable: 'CONFLICTING' })], REPOS, NOW)), {});
    const empty = diffPullRequests(null, [], REPOS, NOW).snapshot;
    const unknown = open({ ci: 'FAILURE', reviewDecision: 'APPROVED' });
    assert.deepEqual(delta(diffPullRequests(empty, [unknown], REPOS, NOW + 10_000)), {});

    const base = diffPullRequests(null, [open()], REPOS, NOW).snapshot;
    const merged = pr('1', 'MERGED', { reviewDecision: 'APPROVED', ci: 'SUCCESS', mergedAt: '2026-01-01T12:00:05Z' });
    assert.deepEqual(delta(diffPullRequests(base, [merged], REPOS, NOW + 10_000)), { merges: 1 });
  });

  test('PRs of repos that are not selected are ignored', () => {
    const other = (extra) => open({ repo: 'someone/else', ...extra });
    const base = diffPullRequests(null, [other()], REPOS, NOW).snapshot;
    assert.deepEqual(delta(diffPullRequests(base, [other({ ci: 'FAILURE' })], REPOS, NOW + 10_000)), {});
  });
});
