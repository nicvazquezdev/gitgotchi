// Near-real-time reactions: local `git push` (instant) and the user's PR state (~10 s).
// Both feed petService.react(), the same channel the Events sync uses.
const store = require('../store');
const session = require('../services/session');
const { GitWatcher } = require('./git-watcher');
const { PrWatcher } = require('./pr-watcher');

function startLive({ petService, powerMonitor }) {
  const prWatcher = new PrWatcher({
    powerMonitor,
    isEnabled: () => petService.isConfigured(),
    fetchPrs: async () => (await session.client()).recentPullRequests(),
    getRepos: () => store.get().repos,
    onActivity: (delta) => petService.react(delta),
    onPullRequests: (prs) => petService.applyPullRequests(prs),
  });
  const gitWatcher = new GitWatcher(() => {
    petService.react({ pushes: 1 }); // animation only: pushes give no XP
    prWatcher.check(); // a push often means a PR was opened or merged
  });

  const refresh = () => {
    gitWatcher.refresh(petService.isConfigured() ? store.get().repos : []);
    prWatcher.reset();
  };
  petService.on('configured', refresh);
  refresh();
  prWatcher.start();
}

module.exports = { startLive };
