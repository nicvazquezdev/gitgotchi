const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { GitHubClient } = require('../src/main/github/client');
const { GITHUB } = require('../src/main/config');
const { toDay } = require('../src/main/dates');

const realFetch = globalThis.fetch;
let calls;

/** Stubs fetch with responses served in order, recording each call. */
const stubFetch = (...responses) => {
  calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts });
    const { status = 200, body = [], link = null } = responses[calls.length - 1] ?? {};
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => (name.toLowerCase() === 'link' ? link : null) },
      json: async () => body,
    };
  };
};

const event = (type, payload = {}, repo = 'a/b', createdAt = '2026-06-15T10:00:00Z') => ({
  type,
  payload,
  repo: { name: repo },
  created_at: createdAt,
});
const nextLink = (url) => `<${url}>; rel="next", <${url}&last>; rel="last"`;

beforeEach(() => stubFetch());
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('activity', () => {
  const client = new GitHubClient('tok');

  test("only reviews on someone else's PR count; every other event is skipped", async () => {
    stubFetch({
      body: [
        event('PushEvent'),
        event('PullRequestEvent', { action: 'opened' }),
        event('PullRequestEvent', { action: 'merged' }),
        event('PullRequestReviewEvent', { pull_request: { user: { login: 'someone' } } }),
        event('PullRequestReviewEvent', { pull_request: { user: { login: 'ME' } } }), // own PR
        event('PullRequestReviewCommentEvent'),
        event('IssueCommentEvent'),
        event('IssuesEvent', { action: 'opened' }),
        event('WatchEvent'),
      ],
    });
    const kinds = (await client.activity('me')).map((e) => e.kind);
    assert.deepEqual(kinds, ['reviews']);
  });

  test('returns repo and local day', async () => {
    stubFetch({ body: [event('PullRequestReviewEvent', {}, 'x/y', '2026-06-15T10:00:00Z')] });
    assert.deepEqual(await client.activity('me'), [
      { kind: 'reviews', repo: 'x/y', day: toDay('2026-06-15T10:00:00Z') },
    ]);
  });

  test('stops at events older than `from`, without fetching more pages', async () => {
    stubFetch(
      {
        body: [
          event('PullRequestReviewEvent', {}, 'a/b', '2026-06-15T10:00:00Z'),
          event('PullRequestReviewEvent', {}, 'a/b', '2026-06-01T10:00:00Z'),
        ],
        link: nextLink('https://api.github.com/page2'),
      },
      { body: [event('PullRequestReviewEvent')] },
    );
    const result = await client.activity('me', new Date('2026-06-10T00:00:00Z'));
    assert.equal(result.length, 1);
    assert.equal(calls.length, 1);
  });

  test('follows Link rel="next" up to the page limit', async () => {
    stubFetch(
      ...Array.from({ length: GITHUB.EVENT_PAGES + 2 }, (_, i) => ({
        body: [event('PullRequestReviewEvent')],
        link: nextLink(`https://api.github.com/page${i + 2}`),
      })),
    );
    const result = await client.activity('me');
    assert.equal(calls.length, GITHUB.EVENT_PAGES);
    assert.equal(result.length, GITHUB.EVENT_PAGES);
    assert.equal(calls[1].url, 'https://api.github.com/page2');
  });

  test('stops when there is no next page', async () => {
    stubFetch({ body: [event('PullRequestReviewEvent')] });
    await client.activity('me');
    assert.equal(calls.length, 1);
  });

  test('requests the encoded user events URL with auth headers', async () => {
    await client.activity('a b');
    assert.equal(calls[0].url, `${GITHUB.API}/users/a%20b/events?per_page=100`);
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
  });
});

describe('pull requests (GraphQL)', () => {
  const client = new GitHubClient('tok');
  const node = (id, updatedAt) => ({
    id,
    number: 1,
    title: 't',
    url: 'u',
    state: 'OPEN',
    isDraft: false,
    reviewDecision: null,
    additions: 5,
    deletions: 7,
    createdAt: updatedAt,
    updatedAt,
    mergedAt: null,
    repository: { nameWithOwner: 'a/b' },
  });
  const page = (nodes, endCursor = null) => ({
    body: { data: { viewer: { pullRequests: { nodes, pageInfo: { hasNextPage: Boolean(endCursor), endCursor } } } } },
  });
  const sentVariables = (i) => JSON.parse(calls[i].opts.body).variables;

  test('normalizes nodes: repo name and changed lines', async () => {
    stubFetch(page([node('1', '2026-06-15T10:00:00Z')]));
    const [pr] = await client.recentPullRequests();
    assert.equal(pr.repo, 'a/b');
    assert.equal(pr.lines, 12);
    assert.equal(pr.repository, undefined);
  });

  test('pullRequestsSince pages until a PR older than `since`, and keeps only newer ones', async () => {
    stubFetch(
      page([node('1', '2026-06-15T10:00:00Z'), node('2', '2026-06-14T10:00:00Z')], 'c1'),
      page([node('3', '2026-06-13T10:00:00Z'), node('4', '2026-06-01T10:00:00Z')], 'c2'),
      page([node('5', '2026-05-01T10:00:00Z')]),
    );
    const prs = await client.pullRequestsSince(new Date('2026-06-10T00:00:00Z'));
    assert.deepEqual(
      prs.map((p) => p.id),
      ['1', '2', '3'],
    );
    assert.equal(calls.length, 2);
    assert.equal(sentVariables(1).after, 'c1');
  });

  test('pullRequestsSince respects maxPages and skips closed PRs only in a backfill', async () => {
    stubFetch(page([node('1', '2026-06-15T10:00:00Z')], 'c1'), page([node('2', '2026-06-15T09:00:00Z')], 'c2'));
    const prs = await client.pullRequestsSince(new Date(0), { backfill: true, maxPages: 2 });
    assert.equal(prs.length, 2);
    assert.equal(calls.length, 2);
    assert.deepEqual(sentVariables(0).states, ['OPEN', 'MERGED']);
    stubFetch(page([]));
    await client.pullRequestsSince(new Date(0));
    assert.deepEqual(sentVariables(0).states, ['OPEN', 'MERGED', 'CLOSED']);
  });
});

describe('errors', () => {
  test('401 explains how to re-authenticate', async () => {
    stubFetch({ status: 401 });
    await assert.rejects(new GitHubClient('bad').viewer(), /rejected the gh token.*gh auth login/);
  });

  test('other failures include status and URL', async () => {
    stubFetch({ status: 500 });
    await assert.rejects(new GitHubClient('t').get('/user'), /GitHub 500 at \/user/);
  });
});
