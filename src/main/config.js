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
  // The pet is drawn on a canvas of whole native sprite pixels: `rows` tall = `headroom` (hearts and particles float
  // above the creature) + 55 (the lowest floor line of any stage, in animations.json) + `below` (under the floor).
  // renderer/pet/pet-view.js builds the same canvas; test/pet-size.test.js checks that the two agree.
  // Pet size = 52 screen px per whole scale step; 208 = 4x, the scale the sprites are designed for.
  // Window at the default size: the canvas plus room around it for the speech bubble card (268 px wide).
  PET_CANVAS: { headroom: 16, below: 2, rows: 73 },
  PET_WINDOW: { width: 288, height: 320 },
  // Sizes run from 1x to 8x the box (`box` = 52 screen px per native px at 1x) in steps of 5% of the default size.
  // Between whole scales a sprite pixel is a fraction of a device pixel wider, so a few columns are one pixel thicker.
  // Set with the slider in the Settings window.
  PET_SIZE_RANGE: { min: 52, max: 416, step: 10.4, box: 52 },
  DEFAULT_PET_SIZE: 208,
  // The menu and the card: fixed width; the height follows the content (the page reports it).
  PANEL_WINDOW: { width: 216, height: 200 },
  POPOVER_WINDOW: { width: 440, height: 400 },
  // Share, settings and evolution windows; the native traffic lights overlay the page's top.
  SHARE_WINDOW: { width: 560, height: 480 },
  SETTINGS_WINDOW: { width: 480, height: 600 },
  EVOLUTION_WINDOW: { width: 960, height: 640 },
  // Default size is also the minimum: below it the steps don't fit.
  ONBOARDING_WINDOW: { width: 560, height: 700, minWidth: 560, minHeight: 700 },

  // Base poll period. Cheap: conditional requests answer 304 when nothing changed.
  // GitHub's X-Poll-Interval header can only raise it.
  SYNC_INTERVAL_MS: 90 * 1000,
  // Recomputes mood (PRs age as time passes) without hitting GitHub.
  TICK_INTERVAL_MS: 5 * 60 * 1000,

  // Near-real-time reactions (see live/).
  LIVE: {
    PR_POLL_MS: 10 * 1000,
    // Used when the system has been idle longer than IDLE_AFTER_S.
    PR_POLL_IDLE_MS: 60 * 1000,
    IDLE_AFTER_S: 5 * 60,
    // The teams the user belongs to (to tell which review requests are theirs) are read this often.
    TEAMS_REFRESH_MS: 60 * 60 * 1000,
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
