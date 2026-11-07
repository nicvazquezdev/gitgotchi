// Reacts to `git push` in local clones of the selected repos, instantly and without network.
// A push appends `update by push` to .git/logs/refs/remotes/origin/<branch>.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LIVE } = require('../config');
const { repoFromRemoteUrl, originUrl, lastLine, isPushReflogLine } = require('./git-remotes');

const sameRepo = (a, b) => a.toLowerCase() === b.toLowerCase();

/** Clones under the common roots: [{ dir, repo }] for clones whose origin is in `repos`. Bounded and async. */
async function discoverClones(repos, home = os.homedir()) {
  const found = [];
  let visited = 0;

  const scan = async (dir, depth) => {
    if (visited++ >= LIVE.CLONE_SCAN_MAX_DIRS) return;
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable or missing
    }
    // A `.git` directory marks a clone (a `.git` file is a worktree or submodule: skipped).
    if (entries.some((e) => e.name === '.git' && e.isDirectory())) {
      const repo = await repoOf(dir);
      if (repo && repos.some((r) => sameRepo(r, repo))) found.push({ dir, repo });
      return;
    }
    if (depth >= LIVE.CLONE_SCAN_DEPTH) return;
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || LIVE.CLONE_SCAN_SKIP.includes(e.name)) continue;
      await scan(path.join(dir, e.name), depth + 1);
    }
  };

  // Roots are scanned to the full depth; the home dir itself only one level (its children are checked).
  await scan(home, LIVE.CLONE_SCAN_DEPTH - 1);
  for (const root of LIVE.CLONE_ROOTS) await scan(path.join(home, root), 0);
  return [...new Map(found.map((c) => [c.dir, c])).values()];
}

async function repoOf(dir) {
  try {
    return repoFromRemoteUrl(originUrl(await fs.promises.readFile(path.join(dir, '.git/config'), 'utf8')));
  } catch {
    return null;
  }
}

class GitWatcher {
  #watchers = [];
  #generation = 0;
  #lastLines = new Map(); // reflog file -> last line seen, to ignore duplicate fs events

  /** `onPush(repo)` is called once per push. */
  constructor(onPush) {
    this.onPush = onPush;
  }

  /** (Re)discovers the clones of `repos` and watches them. */
  async refresh(repos) {
    const generation = ++this.#generation;
    this.stop();
    const clones = repos.length ? await discoverClones(repos) : [];
    if (generation !== this.#generation) return; // a newer refresh superseded this one
    for (const clone of clones) this.#watch(clone);
    console.log(`[live] watching ${clones.length} local clone(s)`);
  }

  stop() {
    for (const w of this.#watchers) w.close();
    this.#watchers = [];
  }

  #watch({ dir, repo }) {
    const remotes = path.join(dir, '.git/logs/refs/remotes');
    try {
      const watcher = fs.watch(remotes, { recursive: true }, (_event, name) => {
        // Only pushes to `origin`: that is the remote the repo name was read from.
        if (name && name.split(path.sep)[0] === 'origin') this.#check(path.join(remotes, name), repo);
      });
      watcher.on('error', () => watcher.close());
      this.#watchers.push(watcher);
    } catch {
      // No remote reflogs yet (never fetched or pushed): nothing to watch.
    }
  }

  async #check(file, repo) {
    let line;
    try {
      line = lastLine(await fs.promises.readFile(file, 'utf8'));
    } catch {
      return; // e.g. branch deleted
    }
    if (this.#lastLines.get(file) === line) return;
    this.#lastLines.set(file, line);
    if (isPushReflogLine(line)) this.onPush(repo);
  }
}

module.exports = { GitWatcher };
