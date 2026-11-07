// App-wide constants.
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

module.exports = {
  // Optional cloud save in the user's own GitHub account (see cloud/cloud-sync.js).
  CLOUD: { PUSH_INTERVAL_MS: 60 * 60 * 1000, PULL_INTERVAL_MS: 30 * 60 * 1000, QUIT_FLUSH_TIMEOUT_MS: 4000 },

  ROOT,
  RENDERER_DIR: path.join(ROOT, 'src/renderer'),
  PRELOAD: path.join(ROOT, 'src/preload/preload.js'),
  IS_MAC: process.platform === 'darwin',

  // Window size at the default sprite size; it grows with the sprite (see ui/pet-size.js).
  // The pet lives in a square box (52 native sprite px: room for the adult plus its hop, see renderer/shared/sprite.js).
  // Pet size = that box in screen px; 208 = 4x, the scale the sprites are designed for.
  // Window at the default size: the box plus room around it for the speech bubble card (268 px wide).
  PET_WINDOW: { width: 288, height: 320 },
  // Any whole-pixel size within [min, max] (2x to 8x); set with the slider in the Settings window.
  PET_SIZE_RANGE: { min: 104, max: 416 },
  DEFAULT_PET_SIZE: 208,
  // Menu-bar dropdown and PR popover: fixed width; the height follows the content (the page reports it).
  PANEL_WINDOW: { width: 320, height: 360 },
  POPOVER_WINDOW: { width: 360, height: 400 },
  // Profile, settings and evolution windows; the native traffic lights overlay the 40 px page title bar.
  PROFILE_WINDOW: { width: 960, height: 500 },
  SETTINGS_WINDOW: { width: 520, height: 560 },
  EVOLUTION_WINDOW: { width: 960, height: 640 },
  // Default size is also the minimum: below it the steps don't fit.
  ONBOARDING_WINDOW: { width: 960, height: 640, minWidth: 960, minHeight: 640 },

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
    PR_PAGES: 20, // pages of 50 PRs when backfilling the user's PRs
  },
};
