// App-wide constants.
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

module.exports = {
  ROOT,
  RENDERER_DIR: path.join(ROOT, 'src/renderer'),
  PRELOAD: path.join(ROOT, 'src/preload/preload.js'),
  IS_MAC: process.platform === 'darwin',

  PET_WINDOW: { width: 168, height: 220 },
  // Default size is also the minimum: below it the pet step doesn't fit.
  ONBOARDING_WINDOW: { width: 640, height: 800, minWidth: 640, minHeight: 800 },

  // Base poll period. Cheap: conditional requests answer 304 when nothing changed.
  // GitHub's X-Poll-Interval header can only raise it.
  SYNC_INTERVAL_MS: 90 * 1000,
  // Recomputes mood (e.g. sleeping at night) without hitting GitHub.
  TICK_INTERVAL_MS: 5 * 60 * 1000,

  GITHUB: {
    API: 'https://api.github.com',
    USER_AGENT: 'gitgotchi-desktop',
    // Where to look for `gh`: apps launched from Finder don't inherit the shell PATH.
    GH_PATHS: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'],
    REPO_PAGES: 3,
    EVENT_PAGES: 3,
  },
};
