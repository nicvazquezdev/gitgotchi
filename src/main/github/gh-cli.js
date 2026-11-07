// Reads accounts and tokens from the `gh` CLI (the same logins you use in the terminal).
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const { GITHUB } = require('../config');

class GhError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** `GITGOTCHI_GH_PATH` overrides the binary (custom installs, or `/usr/bin/false` to simulate a logout). */
function findGh() {
  return process.env.GITGOTCHI_GH_PATH || GITHUB.GH_PATHS.find((p) => fs.existsSync(p)) || 'gh';
}

/** Runs gh and resolves `{ failed, stdout }`. Only a missing binary rejects: `gh auth status` may exit non-zero yet print JSON. */
function run(args) {
  return new Promise((resolve, reject) => {
    execFile(findGh(), args, { timeout: 10_000 }, (err, stdout) => {
      if (err?.code === 'ENOENT') return reject(new GhError('GitHub CLI (gh) not found.', 'GH_NOT_FOUND'));
      resolve({ failed: Boolean(err), stdout: stdout?.trim() ?? '' });
    });
  });
}

/**
 * Pure: accounts of one host from `gh auth status --json hosts` output.
 * Skips accounts whose login is broken (state other than "success"). Never throws.
 * @returns {{ login: string, active: boolean }[]}
 */
function parseAccounts(json, host = GITHUB.HOST) {
  let entries;
  try {
    entries = JSON.parse(json)?.hosts?.[host];
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e?.state === 'success' && typeof e.login === 'string' && e.login)
    .map((e) => ({ login: e.login, active: Boolean(e.active) }));
}

/**
 * Pure: the account to preselect. The preferred login (e.g. the stored one) if still logged in,
 * else the gh-active one, else the first. Null without accounts.
 */
function pickAccount(accounts, preferredLogin) {
  return accounts.find((a) => a.login === preferredLogin) ?? accounts.find((a) => a.active) ?? accounts[0] ?? null;
}

/** Accounts logged in to gh on the GitHub host. Throws `GH_NOT_LOGGED_IN` when there are none. */
async function accounts() {
  const { stdout } = await run(['auth', 'status', '--json', 'hosts']);
  const list = parseAccounts(stdout);
  if (!list.length) throw new GhError('gh is not logged in.', 'GH_NOT_LOGGED_IN');
  return list;
}

/** Token of one specific account. Never switches gh's active account. */
async function token(login) {
  const { failed, stdout } = await run(['auth', 'token', '--hostname', GITHUB.HOST, '--user', login]);
  if (failed || !stdout) {
    throw new GhError(
      `@${login} is no longer logged in to gh. Log in again or pick another account.`,
      'GH_ACCOUNT_MISSING',
    );
  }
  return stdout;
}

module.exports = { accounts, token, parseAccounts, pickAccount, GhError };
