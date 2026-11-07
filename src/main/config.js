// App-wide constants.
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');

module.exports = {
  ROOT,
  RENDERER_DIR: path.join(ROOT, 'src/renderer'),
  PRELOAD: path.join(ROOT, 'src/preload/preload.js'),
  IS_MAC: process.platform === 'darwin',

  // Window size at the default sprite size; it grows with the sprite (see ui/pet-size.js).
  PET_WINDOW: { width: 168, height: 220 },
  // Sprite sizes in px: multiples of the 32 px native sprite keep the pixel art crisp.
  PET_SIZES: [
    { label: 'Small', size: 96 },
    { label: 'Medium', size: 128 },
    { label: 'Large', size: 192 },
    { label: 'Huge', size: 256 },
  ],
  DEFAULT_PET_SIZE: 128,
  // Default size is also the minimum: below it the pet step doesn't fit.
  ONBOARDING_WINDOW: { width: 640, height: 800, minWidth: 640, minHeight: 800 },

  SYNC_INTERVAL_MS: 15 * 60 * 1000,
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
