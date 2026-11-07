// Pure helpers for reading git metadata (no I/O).

const GITHUB_URL =
  /^\s*(?:https?:\/\/(?:[^@/]+@)?|ssh:\/\/(?:[^@/]+@)?|[^@/\s]+@)github\.com[/:]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?\s*$/i;

/** `owner/repo` from an https or ssh remote URL, or null. github.com only. */
function repoFromRemoteUrl(url) {
  const m = GITHUB_URL.exec(url ?? '');
  return m ? `${m[1]}/${m[2]}` : null;
}

/** URL of the `origin` remote in the text of a `.git/config`, or null. */
function originUrl(configText) {
  let inOrigin = false;
  for (const raw of String(configText).split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) inOrigin = /^\[remote\s+"origin"\]$/i.test(line);
    else if (inOrigin) {
      const m = /^url\s*=\s*(.+)$/i.exec(line);
      if (m) return m[1].trim();
    }
  }
  return null;
}

/** Last non-empty line of a text. */
function lastLine(text) {
  return String(text).split('\n').filter(Boolean).at(-1) ?? '';
}

/**
 * True if a reflog line was written by `git push`: its message (after the tab) is `update by push`.
 * Fetch and pull write other messages (`fetch origin: ...`, `pull: ...`).
 */
function isPushReflogLine(line) {
  return String(line).split('\t')[1]?.trim() === 'update by push';
}

module.exports = { repoFromRemoteUrl, originUrl, lastLine, isPushReflogLine };
