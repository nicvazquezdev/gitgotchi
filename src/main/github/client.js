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

  /** GET from the API. Returns the data and the next page URL (if any). */
  async get(url) {
    const res = await fetch(url.startsWith('http') ? url : GITHUB.API + url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': GITHUB.USER_AGENT,
      },
    });
    if (res.status === 401) throw new Error('GitHub rejected the gh token. Run `gh auth login`.');
    if (!res.ok) throw new Error(`GitHub ${res.status} at ${url}`);
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1] ?? null;
    return { data: await res.json(), next };
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
   */
  async activity(login, from = new Date(0)) {
    const result = [];
    await this.paginate(`/users/${encodeURIComponent(login)}/events?per_page=100`, GITHUB.EVENT_PAGES, (events) => {
      for (const ev of events) {
        if (new Date(ev.created_at) < from) return false;
        const kind = EVENT_KINDS[ev.type]?.(ev.payload);
        if (kind) result.push({ kind, repo: ev.repo.name, day: toDay(ev.created_at) });
      }
    });
    return result;
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
