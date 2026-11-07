// GitHub session: reads the `gh` token on every use, so it is never stored or stale.
const store = require('../store');
const gh = require('../github/gh-cli');
const { GitHubClient } = require('../github/client');

const isConnected = () => Boolean(store.get().user);

async function client() {
  return new GitHubClient(await gh.token());
}

/** Validates the `gh` token and stores the user. */
async function connect() {
  const user = await (await client()).viewer();
  store.update({ user });
  return user;
}

/** Forgets user, repos and pet. Leaves the `gh` login untouched. */
function disconnect() {
  store.reset();
}

module.exports = { isConnected, client, connect, disconnect };
