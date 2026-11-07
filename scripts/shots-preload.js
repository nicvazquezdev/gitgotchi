// Preload for `npm run shots`: the same `window.gitgotchi` shape as src/preload/preload.js, filled with fixtures
// instead of IPC. Fixtures come as JSON in the SHOTS_FIXTURES environment variable.
const { contextBridge } = require('electron');

const fx = JSON.parse(process.env.SHOTS_FIXTURES);
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
    prefs: value({ speechBubbles: true, doNotDisturb: false }),
    onPrefs: never,
    openPopover: ignore,
    onPopoverRequest: never,
    size: value(fx.petSize),
    onSize: never,
    onStatus: never,
    onEvolved: never,
    onActivity: never,
  },
  profile: { status: value(fx.status), onStatus: never },
  evolution: { data: value({ fromIndex: 0, toIndex: 1 }), close: ignore, viewProfile: ignore },
  panel: { state: value(fx.panel), onState: never, action: ignore, setHeight: ignore },
  popover: {
    state: value({ ...fx.panel, placement: 'above', tailX: 180 }),
    onState: never,
    action: ignore,
    openPullRequest: ignore,
    setHeight: ignore,
  },
  settings: { state: value(fx.settings), onState: never, action: ignore, setSize: ignore },
});
