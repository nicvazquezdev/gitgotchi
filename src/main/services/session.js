// GitHub session: reads the selected account's `gh` token on every use, so it is never stored or stale.
const store = require('../store');
const gh = require('../github/gh-cli');
const { GitHubClient } = require('../github/client');

const isConnected = () => Boolean(store.get().user);

/** Client for `login` (default: the connected user). Uses that account's token, not gh's active one. */
async function client(login = store.get().user?.login) {
  if (!login) throw new gh.GhError('No GitHub account selected.', 'GH_NOT_LOGGED_IN');
  return new GitHubClient(await gh.token(login));
}

/** Accounts in gh and which one to preselect: the connected user if still there, else the gh-active one. */
async function listAccounts() {
  const accounts = await gh.accounts();
  const { login } = gh.pickAccount(accounts, store.get().user?.login);
  return {
    accounts: accounts.map((a) => ({ ...a, avatarUrl: `https://avatars.githubusercontent.com/${a.login}?size=96` })),
    selected: login,
    // Set when the stored user is no longer logged in to gh.
    missing:
      store.get().user && !accounts.some((a) => a.login === store.get().user.login) ? store.get().user.login : null,
  };
}

/** Validates the token of `login` and stores the user. */
async function connect(login) {
  const user = await (await client(login)).viewer();
  store.update({ user });
  return user;
}

/** Forgets user, repos and pet. Leaves the `gh` logins untouched. */
function disconnect() {
  store.reset();
}

module.exports = { isConnected, client, listAccounts, connect, disconnect };
