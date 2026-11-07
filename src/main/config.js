// App-wide constants.
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

module.exports = {
  ROOT,
  RENDERER_DIR: path.join(ROOT, 'src/renderer'),
  PRELOAD: path.join(ROOT, 'src/preload/preload.js'),
  IS_MAC: process.platform === 'darwin',

  // Window size at the default sprite size; it grows with the sprite (see ui/pet-size.js).
  // The pet lives in a square box (52 native sprite px: room for the adult plus its hop, see renderer/shared/sprite.js).
  // Pet size = that box in screen px; 208 = 4x, the scale the sprites are designed for.
  // Window at the default size: the box plus room above it for the speech bubble.
  PET_WINDOW: { width: 208, height: 280 },
  // Any whole-pixel size within [min, max] (2x to 8x).
  PET_SIZE_RANGE: { min: 104, max: 416 },
  PET_SIZES: [
    { label: 'Small', size: 156 },
    { label: 'Medium', size: 208 },
    { label: 'Large', size: 312 },
    { label: 'Huge', size: 416 },
  ],
  DEFAULT_PET_SIZE: 208,
  // Default size is also the minimum: below it the pet step doesn't fit.
  ONBOARDING_WINDOW: { width: 640, height: 860, minWidth: 640, minHeight: 860 },

  // Base poll period. Cheap: conditional requests answer 304 when nothing changed.
  // GitHub's X-Poll-Interval header can only raise it.
  SYNC_INTERVAL_MS: 90 * 1000,
  // Recomputes mood (e.g. sleeping at night) without hitting GitHub.
  TICK_INTERVAL_MS: 5 * 60 * 1000,

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
