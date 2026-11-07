const { test } = require('node:test');
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
