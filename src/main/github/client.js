// Minimal GitHub REST client with the queries the app needs.
const { GITHUB } = require('../config');
const { toDay } = require('../dates');
const { requestInfo } = require('./review-requests');

/**
 * Which Events API events count as activity: reviews the user submits on someone else's PR and issues they open.
 * (Opened and merged PRs come from GraphQL, see `pullRequestsSince`; pushes are handled by `normalizePush`.)
 * https://docs.github.com/rest/using-the-rest-api/github-event-types
 */
const EVENT_KINDS = {
  PullRequestReviewEvent: (payload, login) =>
    payload.pull_request?.user?.login?.toLowerCase() === login.toLowerCase() ? null : 'reviews',
  IssuesEvent: (payload) => (payload.action === 'opened' ? 'issues' : null),
};

const NULL_SHA = /^0+$/;

/**
 * A push event as `{ kind: 'pushes', id, repo, day, before, head }`, or null when it carries no commits to count
 * (deleted branch, tags). The event does not say how many commits the push has: see `pushCommits`.
 */
function normalizePush(ev) {
  const { push_id: id, ref, before, head } = ev.payload ?? {};
  if (!id || !ref?.startsWith('refs/heads/') || !head || NULL_SHA.test(head)) return null;
  return { kind: 'pushes', id: String(id), repo: ev.repo.name, day: toDay(ev.created_at), before, head };
}

const PR_FIELDS = `id number title url state isDraft reviewDecision additions deletions createdAt updatedAt mergedAt
  repository { nameWithOwner }
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }`;

// Open PRs, not drafts, where the user (or a team they are in) was asked for a review. GitHub drops the user from the
// request once they review, so a PR leaves this list by itself. `review-requested` also covers team requests.
const REVIEW_REQUESTS_QUERY = 'is:pr is:open archived:false draft:false review-requested:@me';

/**
 * GraphQL PR node -> `{ id, number, title, url, state, isDraft, reviewDecision, ci, lines, createdAt, updatedAt, mergedAt, repo }`.
 * `ci`: the checks state of the last commit (SUCCESS, FAILURE, ERROR, PENDING, EXPECTED), null when there are none.
 */
const normalizePullRequest = ({ repository, additions, deletions, commits, ...pr }) => ({
  ...pr,
  ci: commits?.nodes?.[0]?.commit?.statusCheckRollup?.state ?? null,
  lines: additions + deletions,
  repo: repository.nameWithOwner,
});

class GitHubClient {
  #defaultBranches = new Map(); // 'owner/name' -> its default branch, looked up once

  constructor(token) {
    this.token = token;
  }

  headers(extra = {}) {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': GITHUB.USER_AGENT,
      ...extra,
    };
  }

  /**
   * GET from the API. Returns the data and the next page URL (if any).
   * With `etag`, sends a conditional request: on 304 it returns `{ notModified: true }`.
   * Also returns the response `etag` and `pollInterval` (seconds) when present.
   */
  async get(url, { etag } = {}) {
    const res = await fetch(url.startsWith('http') ? url : GITHUB.API + url, {
      headers: this.headers(etag && { 'If-None-Match': etag }),
    });
    const meta = { etag: res.headers.get('etag'), pollInterval: Number(res.headers.get('x-poll-interval')) || null };
    if (res.status === 304) return { notModified: true, ...meta };
    if (res.status === 401) throw new Error('GitHub rejected the gh token. Run `gh auth login`.');
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status} at ${url}`), { status: res.status });
    const next = /<([^>]+)>;\s*rel="next"/.exec(res.headers.get('link') || '')?.[1] ?? null;
    return { data: await res.json(), next, ...meta };
  }

  /** POST/PUT/PATCH with a JSON body. Errors carry `status` (e.g. 404, 409). */
  async send(method, url, body) {
    const res = await fetch(GITHUB.API + url, {
      method,
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status} at ${url}`), { status: res.status });
    return res.json();
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
   * Review, issue and push events since `from`, normalized: [{ kind: 'reviews' | 'issues', repo, day }] and
   * [{ kind: 'pushes', id, repo, day, before, head }] (see `normalizePush`).
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
        if (ev.type === 'PushEvent') {
          const push = normalizePush(ev);
          if (push) result.push(push);
          continue;
        }
        const kind = EVENT_KINDS[ev.type]?.(ev.payload, login);
        if (kind) result.push({ kind, repo: ev.repo.name, day: toDay(ev.created_at) });
      }
    };
    if (collect(first.data) !== false && first.next) await this.paginate(first.next, GITHUB.EVENT_PAGES - 1, collect);
    return result;
  }

  async defaultBranch(repo) {
    if (!this.#defaultBranches.has(repo)) {
      const { data } = await this.get(`/repos/${repo}`);
      this.#defaultBranches.set(repo, data.default_branch);
    }
    return this.#defaultBranches.get(repo);
  }

  /**
   * The user's own commits in a push: `[{ authorDate, message }]`, no merge commits and none by other people
   * (a push that merges the main branch carries theirs too). Compares the push with what was there before it.
   * A new branch (no `before`), or a `before` that is gone after a force-push, compares with the default branch
   * instead: that can list commits counted by an earlier push, which the caller dedupes (see game/commits.js).
   * Throws on network errors, rate limits and the like, so the push can be looked up again later.
   */
  async pushCommits(repo, { before, head }, login) {
    const compare = async (base) => {
      const { data } = await this.get(`/repos/${repo}/compare/${base}...${head}?per_page=100`);
      return data.commits ?? [];
    };
    let commits;
    try {
      commits = await compare(NULL_SHA.test(before) ? await this.defaultBranch(repo) : before);
    } catch (err) {
      if (err.status !== 404 && err.status !== 422) throw err;
      try {
        commits = await compare(await this.defaultBranch(repo));
      } catch (retry) {
        if (retry.status !== 404 && retry.status !== 422) throw retry;
        return []; // the push is gone (branch deleted, repo no longer reachable): nothing to count
      }
    }
    const mine = login.toLowerCase();
    return commits
      .filter((c) => c.author?.login?.toLowerCase() === mine && (c.parents?.length ?? 1) === 1)
      .map((c) => ({ authorDate: c.commit.author.date, message: c.commit.message }));
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

  /** One page of the viewer's PRs, most recently updated first. Costs 1 point. */
  async pullRequestsPage({ first, after = null, states }) {
    const data = await this.graphql(
      `query($first: Int!, $after: String, $states: [PullRequestState!]) { viewer {
        pullRequests(first: $first, after: $after, orderBy: {field: UPDATED_AT, direction: DESC}, states: $states) {
          pageInfo { hasNextPage endCursor } nodes { ${PR_FIELDS} } } } }`,
      { first, after, states },
    );
    const { nodes, pageInfo } = data.viewer.pullRequests;
    return { prs: nodes.map(normalizePullRequest), next: pageInfo.hasNextPage ? pageInfo.endCursor : null };
  }

  /**
   * Open PRs waiting for the viewer's review (at most 50, any repo), as normalized PRs plus `author` (a login) and
   * `requestedAt` / `via` (when and through whom the viewer was asked, see review-requests.js).
   * `me`: `{ login, teams }`, the viewer and the teams they belong to (see `myTeams`). A couple of points.
   */
  async reviewRequests(me) {
    const reviewer = '{ __typename ... on User { login } ... on Team { combinedSlug } }';
    const data = await this.graphql(
      `query($q: String!) { search(query: $q, type: ISSUE, first: 50) {
        nodes { ... on PullRequest { ${PR_FIELDS} author { login }
          reviewRequests(first: 30) { nodes { requestedReviewer ${reviewer} } }
          timelineItems(last: 100, itemTypes: [REVIEW_REQUESTED_EVENT]) {
            nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer ${reviewer} } } }
        } } } }`,
      { q: REVIEW_REQUESTS_QUERY },
    );
    return data.search.nodes
      .filter((node) => node?.id)
      .map(({ author, reviewRequests, timelineItems, ...node }) => ({
        ...normalizePullRequest(node),
        author: author?.login ?? null,
        ...requestInfo(
          {
            pending: reviewRequests?.nodes?.map((n) => n.requestedReviewer) ?? [],
            events: timelineItems?.nodes ?? [],
          },
          me,
        ),
      }));
  }

  /** The teams ('org/slug', lower case) `login` belongs to, in the organizations they are a member of. One point. */
  async myTeams(login) {
    const data = await this.graphql(
      `query($me: String!) { viewer { organizations(first: 20) { nodes {
        teams(first: 100, userLogins: [$me]) { nodes { combinedSlug } } } } } }`,
      { me: login },
    );
    return data.viewer.organizations.nodes.flatMap((org) => org.teams.nodes.map((t) => t.combinedSlug.toLowerCase()));
  }

  /** The viewer's 30 most recently updated PRs (any state): the 10 s watcher query. */
  async recentPullRequests() {
    return (await this.pullRequestsPage({ first: 30, states: ['OPEN', 'MERGED', 'CLOSED'] })).prs;
  }

  /**
   * The viewer's PRs updated since `since` (a Date), newest update first, at most `maxPages` pages of 50.
   * A backfill skips closed PRs; the incremental call includes them so a PR closed without merging leaves the list.
   */
  async pullRequestsSince(since, { backfill = false, maxPages = GITHUB.PR_PAGES } = {}) {
    const states = backfill ? ['OPEN', 'MERGED'] : ['OPEN', 'MERGED', 'CLOSED'];
    const result = [];
    let after = null;
    for (let page = 0; page < maxPages; page++) {
      const { prs, next } = await this.pullRequestsPage({ first: 50, after, states });
      const fresh = prs.filter((pr) => new Date(pr.updatedAt) >= since);
      result.push(...fresh);
      if (fresh.length < prs.length || !next) break;
      after = next;
    }
    return result;
  }

  // ---------- Files in a repo (Contents API), used by the cloud save ----------

  /** A JSON file from a repo: `{ json, sha }`, or null when the repo or the file doesn't exist. */
  async readJsonFile(owner, repo, path) {
    try {
      const { data } = await this.get(`/repos/${owner}/${repo}/contents/${path}`);
      return { json: JSON.parse(Buffer.from(data.content, 'base64').toString('utf8')), sha: data.sha };
    } catch (err) {
      if (/GitHub 404/.test(err.message)) return null;
      throw err;
    }
  }

  /** Creates or replaces a JSON file (pass the current `sha` to replace). Returns the new sha. */
  async writeJsonFile(owner, repo, path, { json, sha, message, identity }) {
    const content = Buffer.from(`${JSON.stringify(json, null, 2)}\n`).toString('base64');
    const body = { message, content, ...(sha && { sha }), ...(identity && { author: identity, committer: identity }) };
    const { content: file } = await this.send('PUT', `/repos/${owner}/${repo}/contents/${path}`, body);
    return file.sha;
  }

  async repoExists(owner, repo) {
    try {
      await this.get(`/repos/${owner}/${repo}`);
      return true;
    } catch (err) {
      if (/GitHub 404/.test(err.message)) return false;
      throw err;
    }
  }

  createPrivateRepo(name, description) {
    return this.send('POST', '/user/repos', { name, description, private: true, has_issues: false, has_wiki: false });
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
