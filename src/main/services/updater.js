// Updates: asks the GitHub releases (through electron-updater) whether a newer version is out, and quietly says so.
// Where the app can replace itself (the Windows installer, a Linux AppImage) the new version downloads by itself and
// installs when the person quits or picks "Restart to update". Elsewhere (macOS, whose updates need a Developer ID
// signature, and the Linux .deb) it only says that a version is out and opens its page. No window, no notification:
// the news lives in a row of Settings and an item of the menu.
const EventEmitter = require('node:events');

const FIRST_CHECK_MS = 60 * 1000; // not while the app is starting
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** The menu item that appears only when there is news (the menu and the tray menu show it as it is). */
function menuLabel({ supported, status, latest }) {
  if (!supported) return null;
  if (status === 'ready') return 'Restart to update';
  if (status === 'available') return `Update to ${latest}…`;
  return null;
}

/**
 * @param {{ getAutoUpdater: () => object, version: string, packaged: boolean, canInstall: boolean,
 *           openReleases: () => void, firstCheckMs?: number, checkEveryMs?: number }} deps
 *   `getAutoUpdater` is only called in a packaged app (electron-updater has nothing to read in development).
 * @returns {EventEmitter & { state: () => object, start: () => void, check: () => Promise<void>, apply: () => void }}
 *   emits `change` after every change of the state
 */
function createUpdater({
  getAutoUpdater,
  version,
  packaged,
  canInstall,
  openReleases,
  firstCheckMs = FIRST_CHECK_MS,
  checkEveryMs = CHECK_EVERY_MS,
}) {
  const updater = new EventEmitter();
  // status: idle (up to date, or not known yet) | checking | available (a version is out, to get by hand)
  //   | downloading | ready (downloaded, installs on restart)
  const initial = {
    version,
    supported: packaged,
    status: 'idle',
    latest: null,
    progress: 0,
    error: null,
    checkedAt: null,
  };
  let state = { ...initial, menuLabel: menuLabel(initial) };
  let autoUpdater = null;

  const set = (patch) => {
    const next = { ...state, ...patch };
    state = { ...next, menuLabel: menuLabel(next) };
    updater.emit('change', state);
  };

  function listen() {
    autoUpdater.autoDownload = canInstall;
    autoUpdater.autoInstallOnAppQuit = canInstall;
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on('checking-for-update', () => set({ status: 'checking', error: null }));
    autoUpdater.on('update-available', (info) =>
      set({
        status: canInstall ? 'downloading' : 'available',
        latest: info.version,
        progress: 0,
        checkedAt: Date.now(),
      }),
    );
    autoUpdater.on('update-not-available', () =>
      set({ status: 'idle', latest: null, progress: 0, checkedAt: Date.now() }),
    );
    autoUpdater.on('download-progress', ({ percent }) => set({ progress: Math.round(percent) }));
    autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', latest: info.version, progress: 100 }));
    // A failed check says so in Settings, and goes back to what it knew: a version that is out stays out.
    autoUpdater.on('error', (err) =>
      set({ status: state.latest && !canInstall ? 'available' : 'idle', error: err?.message ?? 'Unknown error' }),
    );
  }

  /** Starts the checks: one a minute after the app opens, then every few hours. Does nothing in development. */
  updater.start = () => {
    if (!packaged || autoUpdater) return;
    autoUpdater = getAutoUpdater();
    listen();
    setTimeout(updater.check, firstCheckMs).unref();
    setInterval(updater.check, checkEveryMs).unref();
  };

  /** Asks now. A check or a download that is already going, or one that is ready, is not asked again. */
  updater.check = async () => {
    if (!autoUpdater || ['checking', 'downloading', 'ready'].includes(state.status)) return;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // The `error` event already put it in the state.
    }
  };

  /** Ready: restarts into the new version. A version that is out: opens its page. */
  updater.apply = () => {
    if (state.status === 'ready') autoUpdater.quitAndInstall(true, true);
    else if (state.status === 'available') openReleases();
  };

  updater.state = () => state;
  return updater;
}

module.exports = { createUpdater };
