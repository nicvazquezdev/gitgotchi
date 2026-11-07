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

  test('maps event types to kinds and skips the rest', async () => {
    stubFetch({
      body: [
        event('PushEvent'),
        event('PullRequestEvent', { action: 'opened' }),
        event('PullRequestEvent', { action: 'merged' }),
        event('PullRequestEvent', { action: 'closed' }),
        event('PullRequestReviewEvent'),
        event('PullRequestReviewCommentEvent'),
        event('IssueCommentEvent'),
        event('IssuesEvent', { action: 'opened' }),
        event('IssuesEvent', { action: 'closed' }),
        event('WatchEvent'),
      ],
    });
    const kinds = (await client.activity('me')).map((e) => e.kind);
    assert.deepEqual(kinds, ['pushes', 'prs', 'merges', 'reviews', 'comments', 'comments', 'issues']);
  });

  test('returns repo and local day', async () => {
    stubFetch({ body: [event('PushEvent', {}, 'x/y', '2026-06-15T10:00:00Z')] });
    assert.deepEqual(await client.activity('me'), [
      { kind: 'pushes', repo: 'x/y', day: toDay('2026-06-15T10:00:00Z') },
    ]);
  });

  test('stops at events older than `from`, without fetching more pages', async () => {
    stubFetch(
      {
        body: [
          event('PushEvent', {}, 'a/b', '2026-06-15T10:00:00Z'),
          event('PushEvent', {}, 'a/b', '2026-06-01T10:00:00Z'),
        ],
        link: nextLink('https://api.github.com/page2'),
      },
      { body: [event('PushEvent')] },
    );
    const result = await client.activity('me', new Date('2026-06-10T00:00:00Z'));
    assert.equal(result.length, 1);
    assert.equal(calls.length, 1);
  });

  test('follows Link rel="next" up to the page limit', async () => {
    stubFetch(
      ...Array.from({ length: GITHUB.EVENT_PAGES + 2 }, (_, i) => ({
        body: [event('PushEvent')],
        link: nextLink(`https://api.github.com/page${i + 2}`),
      })),
    );
    const result = await client.activity('me');
    assert.equal(calls.length, GITHUB.EVENT_PAGES);
    assert.equal(result.length, GITHUB.EVENT_PAGES);
    assert.equal(calls[1].url, 'https://api.github.com/page2');
  });

  test('stops when there is no next page', async () => {
    stubFetch({ body: [event('PushEvent')] });
    await client.activity('me');
    assert.equal(calls.length, 1);
  });

  test('requests the encoded user events URL with auth headers', async () => {
    await client.activity('a b');
    assert.equal(calls[0].url, `${GITHUB.API}/users/a%20b/events?per_page=100`);
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer tok');
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
