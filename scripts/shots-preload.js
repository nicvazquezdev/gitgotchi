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
  bootstrap: value({ user: null, repos: [], pet: null, status: fx.status, catalog: fx.catalog }),
  auth: {
    accounts: value({ accounts: fx.onboarding.accounts, selected: 'sample-user', missing: false }),
    connect: value({ user: { login: 'sample-user' } }),
    disconnect: ignore,
  },
  onboarding: { listRepos: value(fx.onboarding.repos), finish: value({}) },
  cloud: { find: value(fx.onboarding.save), restore: value({}) },
  pet: {
    status: value(fx.status),
    refresh: value(fx.status),
    setClickThrough: ignore,
    dragStart: ignore,
    dragAlive: ignore,
    dragShift: ignore,
    dragEnd: ignore,
    openMenu: ignore,
    prefs: value({ speechBubbles: true, playful: true }),
    onPrefs: never,
    openPopover: ignore,
    onPopoverRequest: never,
    onPopoverOpen: never,
    onBump: never,
    onPointer: never,
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
  share: { status: value(fx.status), onStatus: never, copyCard: value({ ok: true }) },
  panel: { state: value(fx.panel), onState: never, action: ignore, setHeight: ignore },
  popover: {
    state: value({ ...fx.panel, placement: 'above' }),
    onState: never,
    action: ignore,
    openPullRequest: ignore,
    setHeight: ignore,
  },
  settings: { state: value(fx.settings), onState: never, action: ignore, setSize: ignore },
});
