// Preload for `npm run shots`: the same `window.gitgotchi` shape as src/preload/preload.js, filled with fixtures
// instead of IPC. Fixtures come as JSON in the SHOTS_FIXTURES environment variable.
const { contextBridge, webFrame } = require('electron');

const fx = JSON.parse(process.env.SHOTS_FIXTURES);

// `--freeze`: the page sees the same moment on every run (dates in the page are relative to it). This runs before
// the page's own scripts.
if (fx.freeze) {
  webFrame.executeJavaScript(`(() => {
    const FIXED = ${fx.freeze};
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) {
        if (args.length) super(...args);
        else super(FIXED);
      }
      static now() {
        return FIXED;
      }
    };
  })()`);
}
const value = (v) => async () => v;
const never = () => () => {};
const ignore = () => {};

contextBridge.exposeInMainWorld('gitgotchi', {
  bootstrap: value({ status: fx.status, catalog: fx.catalog }),
  auth: { accounts: value({ accounts: [], selected: null, missing: false }), connect: value({}), disconnect: ignore },
  onboarding: { listRepos: value([]), finish: value({}) },
  cloud: { find: value({ found: false }), restore: value({}) },
  pet: {
    status: value(fx.status),
    refresh: value(fx.status),
    setClickThrough: ignore,
    dragStart: ignore,
    dragEnd: ignore,
    openMenu: ignore,
    prefs: value({ speechBubbles: true }),
    onPrefs: never,
    openPopover: ignore,
    onPopoverRequest: never,
    size: value(fx.petSize),
    onSize: never,
    onStatus: never,
    onEvolved: never,
    onActivity: never,
    onCompanion: never,
    // `--level-up`: the pet reaches a new level a moment after it loads
    onLevelUp: (callback) => {
      if (fx.levelUp) setTimeout(() => callback(fx.levelUp), 300);
      return () => {};
    },
    // `--celebrate`: the pet gets new achievements a moment after it loads
    onAchievements: (callback) => {
      if (fx.celebrate) setTimeout(() => callback(fx.celebrate), 300);
      return () => {};
    },
  },
  pets: { activate: ignore, hatch: ignore, rename: ignore },
  profile: {
    status: value(fx.status),
    onStatus: never,
    view: value(null),
    onView: never,
    copyCard: value({ ok: true }),
  },
  evolution: { data: value(fx.evolution), close: ignore, viewProfile: ignore },
  panel: { state: value(fx.panel), onState: never, action: ignore, setHeight: ignore },
  popover: {
    state: value({ ...fx.panel, placement: 'above', tailX: 180, room: 760 }), // room: a laptop screen
    onState: never,
    action: ignore,
    openPullRequest: ignore,
    setHeight: ignore,
  },
  settings: { state: value(fx.settings), onState: never, action: ignore, setSize: ignore },
});
