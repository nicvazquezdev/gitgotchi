// Minimal GitHub REST client with the queries the app needs.
const { GITHUB } = require('../config');
const { toDay } = require('../dates');

/**
 * Which Events API events count as activity, and of which kind.
 * https://docs.github.com/rest/using-the-rest-api/github-event-types
 */
const EVENT_KINDS = {
  PushEvent: () => 'pushes',
  PullRequestEvent: (p) => ({ opened: 'prs', merged: 'merges' })[p.action],
  PullRequestReviewEvent: () => 'reviews',
  PullRequestReviewCommentEvent: () => 'comments',
  IssueCommentEvent: () => 'comments',
  IssuesEvent: (p) => (p.action === 'opened' ? 'issues' : null),
};

class GitHubClient {
  constructor(token) {
    this.token = token;
  }

  /**
   * GET from the API. Returns the data and the next page URL (if any).
   * With `etag`, sends a conditional request: on 304 it returns `{ notModified: true }`.
   * Also returns the response `etag` and `pollInterval` (seconds) when present.
   */
  async get(url, { etag } = {}) {
    const res = await fetch(url.startsWith('http') ? url : GITHUB.API + url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': GITHUB.USER_AGENT,
        ...(etag && { 'If-None-Match': etag }),
      },
    });
    const meta = { etag: res.headers.get('etag'), pollInterval: Number(res.headers.get('x-poll-interval')) || null };
    if (res.status === 304) return { notModified: true, ...meta };
    if (res.status === 401) throw new Error('GitHub rejected the gh token. Run `gh auth login`.');
    if (!res.ok) throw new Error(`GitHub ${res.status} at ${url}`);
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1] ?? null;
    return { data: await res.json(), next, ...meta };
  }

  /** Walks pages up to `maxPages` or until `onPage` returns false. */
  async paginate(url, maxPages, onPage) {
    for (let page = 0; url && page < maxPages; page++) {
      const { data, next } = await this.get(url);
      if (onPage(data) === false) return;
      url = next;
    }
  }

  async viewer() {
    const { data } = await this.get('/user');
    return { login: data.login, name: data.name, avatarUrl: data.avatar_url };
  }

  /**
   * User activity since `from`, normalized: [{ kind, repo, day }].
   * Includes private repos. GitHub returns at most the latest 300 events.
   *
   * Pass a `poll` object (`{ etag, interval }`) to use conditional requests: the first page is
   * requested with its last ETag, and a 304 (free, not rate-limited) returns `null`.
   * `poll` is updated with the new ETag and GitHub's X-Poll-Interval.
   */
  async activity(login, from = new Date(0), poll = null) {
    const first = await this.get(`/users/${encodeURIComponent(login)}/events?per_page=100`, { etag: poll?.etag });
    if (poll) {
      poll.interval = first.pollInterval ?? poll.interval;
      if (first.notModified) return null;
      poll.etag = first.etag;
    }

    const result = [];
    const collect = (events) => {
      for (const ev of events) {
        if (new Date(ev.created_at) < from) return false;
        const kind = EVENT_KINDS[ev.type]?.(ev.payload);
        if (kind) result.push({ kind, repo: ev.repo.name, day: toDay(ev.created_at) });
      }
    };
    if (collect(first.data) !== false && first.next) await this.paginate(first.next, GITHUB.EVENT_PAGES - 1, collect);
    return result;
  }

  /** Minimal GraphQL call. Throws on transport or GraphQL errors. */
  async graphql(query, variables = {}) {
    const res = await fetch(`${GITHUB.API}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        'User-Agent': GITHUB.USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (res.status === 401) throw new Error('GitHub rejected the gh token. Run `gh auth login`.');
    if (!res.ok) throw new Error(`GitHub ${res.status} at graphql`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(`GitHub GraphQL: ${body.errors[0].message}`);
    return body.data;
  }

  /** The viewer's 20 most recently updated open or merged PRs: [{ id, state, createdAt, mergedAt, repo }]. Costs 1 point. */
  async recentPullRequests() {
    const data = await this.graphql(`{ viewer { pullRequests(first: 20, orderBy: {field: UPDATED_AT, direction: DESC},
      states: [OPEN, MERGED]) { nodes { id number title state createdAt mergedAt repository { nameWithOwner } } } } }`);
    return data.viewer.pullRequests.nodes.map(({ repository, ...pr }) => ({ ...pr, repo: repository.nameWithOwner }));
  }

  /** Repos the user can access, sorted by last push. */
  async accessibleRepos() {
    const repos = [];
    await this.paginate(
      '/user/repos?affiliation=owner,collaborator,organization_member&sort=pushed&per_page=100',
      GITHUB.REPO_PAGES,
      (page) => {
        for (const r of page) repos.push({ fullName: r.full_name, private: r.private, pushedAt: r.pushed_at });
      },
    );
    return repos;
  }
}

module.exports = { GitHubClient };
