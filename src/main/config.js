// App-wide constants.
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

module.exports = {
  ROOT,
  RENDERER_DIR: path.join(ROOT, 'src/renderer'),
  PRELOAD: path.join(ROOT, 'src/preload/preload.js'),
  IS_MAC: process.platform === 'darwin',

  // Window size at the default sprite size; it grows with the sprite (see ui/pet-size.js).
  PET_WINDOW: { width: 168, height: 340 },
  // Sprite sizes in px: multiples of the 32 px native sprite keep the pixel art crisp.
  // Any whole-pixel size within [min, max] is allowed. PET_SIZES are the menu presets.
  PET_SIZE_RANGE: { min: 64, max: 320 },
  PET_SIZES: [
    { label: 'Small', size: 96 },
    { label: 'Medium', size: 128 },
    { label: 'Large', size: 192 },
    { label: 'Huge', size: 256 },
  ],
  DEFAULT_PET_SIZE: 128,
  // Default size is also the minimum: below it the pet step doesn't fit.
  ONBOARDING_WINDOW: { width: 640, height: 800, minWidth: 640, minHeight: 800 },

  // Base poll period. Cheap: conditional requests answer 304 when nothing changed.
  // GitHub's X-Poll-Interval header can only raise it.
  SYNC_INTERVAL_MS: 90 * 1000,
  // Recomputes mood (e.g. sleeping at night) without hitting GitHub.
  TICK_INTERVAL_MS: 5 * 60 * 1000,

  // Near-real-time reactions (see live/).
  LIVE: {
    PR_POLL_MS: 10 * 1000,
    // Used when the system has been idle longer than IDLE_AFTER_S.
    PR_POLL_IDLE_MS: 60 * 1000,
    IDLE_AFTER_S: 5 * 60,
    // A live reaction hides the same activity from the Events diff for this long.
    CREDIT_TTL_MS: 10 * 60 * 1000,
    // Local clone discovery: folders under the home dir, scanned to a limited depth and size.
    CLONE_ROOTS: ['Documents', 'Developer', 'dev', 'code', 'projects', 'src', 'repos', 'workspace', 'github', 'git'],
    CLONE_SCAN_DEPTH: 3,
    CLONE_SCAN_MAX_DIRS: 5000,
    CLONE_SCAN_SKIP: ['node_modules', 'Library'],
  },

  GITHUB: {
    HOST: 'github.com', // Only github.com accounts are listed (GitHub Enterprise hosts are not supported yet)
    API: 'https://api.github.com',
    USER_AGENT: 'gitgotchi-desktop',
    // Where to look for `gh`: apps launched from Finder don't inherit the shell PATH.
    GH_PATHS: ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'],
    REPO_PAGES: 3,
    EVENT_PAGES: 3,
  },
};
