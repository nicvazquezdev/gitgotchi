// Entry point: app lifecycle and wiring between services and UI.
const { app, screen, powerMonitor, systemPreferences, nativeTheme, Menu } = require('electron');
const {
  IS_MAC,
  IS_WIN,
  IS_LINUX,
  APP_ID,
  PET_SIZE_RANGE,
  DEFAULT_PET_SIZE,
  TICK_INTERVAL_MS,
  CLOUD,
  LIVE,
  GITHUB,
} = require('./config');

const session = require('./services/session');
const petService = require('./services/pet-service');
const petWindow = require('./ui/pet-window');
const onboardingWindow = require('./ui/onboarding-window');
const panelWindow = require('./ui/panel-window');
const shareWindow = require('./ui/share-window');
const settingsWindow = require('./ui/settings-window');
const popoverWindow = require('./ui/popover-window');
const { toScreenRect } = require('./ui/popover-position');
const { openGithub } = require('./ui/external-links');
const { createTray } = require('./ui/tray');
const { trayMenuTemplate } = require('./ui/tray-menu');
const store = require('./store');
const prefs = require('./prefs');
const { registerIpc } = require('./ipc');
const loginItem = require('./login-item');
const { startLive } = require('./live');
const cloud = require('./cloud/cloud-sync');
const { createUpdater } = require('./services/updater');

let tray = null;

// Updates (see services/updater.js): the Windows installer and a Linux AppImage replace themselves; the rest tell where to get the new version.
const updater = createUpdater({
  getAutoUpdater: () => require('electron-updater').autoUpdater,
  version: app.getVersion(),
  packaged: app.isPackaged,
  canInstall: IS_WIN || (IS_LINUX && Boolean(process.env.APPIMAGE)),
  openReleases: () => openGithub(GITHUB.RELEASES_URL),
});

// macOS reopens the windows of an app that was killed or quit while it was starting, and asks "The last time you
// opened … it unexpectedly quit while reopening windows". This app builds its own windows and restarts a lot in
// development (the old process is killed), so it never wants that: it asks macOS not to restore anything.
// Both are read from the app's own preferences, so they take effect from the next launch on.
if (IS_MAC) {
  systemPreferences.setUserDefault('ApplePersistenceIgnoreState', 'boolean', true);
  systemPreferences.setUserDefault('NSQuitAlwaysKeepsWindows', 'boolean', false);
}

// The Windows taskbar groups and names the app by this id (the installer uses the same one).
if (IS_WIN) app.setAppUserModelId(APP_ID);

// ---------- App actions ----------

const actions = {
  openShare: () => shareWindow.open(),
  // The card hangs from the pet (it answers with the rect to anchor on, see `togglePopover`), or from the menu bar icon
  // when the pet is hidden.
  openCard: () => (petWindow.isVisible() ? petWindow.send('pet:popover-request') : showPopoverAtTray()),
  sync: () => petService.sync(),
  togglePet: () => {
    if (petWindow.isVisible()) petWindow.hide();
    else petWindow.show();
    panelWindow.send();
    refreshTrayMenu();
  },
  // Setup flow (onboarding): connect GitHub, pick repos and the pet.
  openSetup: () =>
    onboardingWindow.open({
      // Closing before finishing the first setup leaves nothing to show.
      onClosed: () => !petService.isConfigured() && app.quit(),
    }),
  // Until the first setup is done, there is nothing to set: Settings opens the setup flow.
  openSettings: () => (petService.isConfigured() ? settingsWindow.open() : actions.openSetup()),
  finishOnboarding: () => {
    onboardingWindow.close();
    petWindow.show();
  },
  disconnect: () => {
    session.disconnect();
    petWindow.close();
    actions.openSetup();
  },
  // --- vacation (see game/time-off.js): the menu, the card and Settings share these; the status that follows updates
  // every window ---
  // A vacation starts with no set return; Settings is where the person picks the day they are back.
  startVacation: () => {
    petService.startTimeOff();
    actions.openSettings();
  },
  toggleVacation: () => (petService.isOnTimeOff() ? petService.endTimeOff() : petService.startTimeOff()),
  resume: () => petService.endTimeOff(),
  setVacationReturn: (day) => petService.setTimeOffReturn(day),
  // --- end vacation ---
  toggleOpenAtLogin: () => {
    loginItem.setEnabled(!loginItem.isEnabled());
    settingsWindow.send();
  },
  toggleCloudSync: () => {
    if (cloud.isBusy()) return; // wait for the current step to finish
    if (cloud.isEnabled()) cloud.disable();
    else cloud.enable();
    settingsWindow.send();
  },
  // The backup repo (it stays in the account after the backup is turned off).
  openSaveRepo: () => {
    const { repo } = cloud.status();
    if (repo) openGithub(`https://github.com/${repo}`);
  },
  // Live while dragging the Settings slider (`persist` false); saved on release.
  setPetSize: (size, persist = true) => {
    petWindow.setSize(size, { persist });
    if (persist) settingsWindow.send();
  },
  openMenu: () => actions.showMenu(),
  showMenu: () => {
    const { x, y } = screen.getCursorScreenPoint();
    panelWindow.show({ x, y, width: 0, height: 0 });
  },
  // --- everyday UI: menu bar dropdown, the card, pet bubble ---
  toggleSpeechBubbles: () => togglePref('speechBubbles'),
  togglePlayful: () => togglePref('playful'),
  // The pet window knows where the creature is: it answers with the rect to anchor on (`togglePopover`).
  /** `rect`: the creature's rect in the pet window's own coordinates. */
  togglePopover: (rect) => {
    const win = petWindow.window;
    const onPet = win && petWindow.isVisible();
    popoverPetRect = onPet ? rect : null;
    popoverWindow.toggle(onPet ? toScreenRect(win.getBounds(), rect) : trayAnchor());
  },
  // --- end everyday UI ---
  panelState: () => ({
    status: petService.status(),
    configured: petService.isConfigured(),
    connected: session.isConnected(),
    petVisible: petWindow.isVisible(),
    update: updater.state(),
  }),
  settingsState: () => {
    const { user, repos } = store.get();
    return {
      login: user?.login ?? null,
      repoCount: repos.length,
      speechBubbles: prefs.speechBubbles(),
      playful: prefs.playful(),
      pause: petService.timeOff(),
      openAtLogin: loginItem.isEnabled(),
      cloud: cloud.status(),
      update: updater.state(),
      petSize: petWindow.size(),
      sizeRange: PET_SIZE_RANGE,
      defaultPetSize: DEFAULT_PET_SIZE,
    };
  },
  checkForUpdates: () => updater.check(),
  applyUpdate: () => updater.apply(),
  quit: () => app.quit(),
};

// Linux does not say where the tray icon is (it reports zeros): the cursor, where the person just clicked, stands in.
const trayAnchor = () => {
  const bounds = tray.getBounds();
  if (bounds.width || bounds.height) return bounds;
  const { x, y } = screen.getCursorScreenPoint();
  return { x, y, width: 0, height: 0 };
};

// The tray menu on Linux is native and static: it is built again whenever what it shows changes.
const refreshTrayMenu = () =>
  IS_LINUX && tray?.setContextMenu(Menu.buildFromTemplate(trayMenuTemplate(actions.panelState(), actions)));

// The popover hangs from the creature (its rect in the pet window's coordinates) or from the menu bar icon (null).
// From the creature it goes along when the pet is dragged.
let popoverPetRect = null;
const showPopoverAtTray = () => {
  popoverPetRect = null;
  popoverWindow.show(trayAnchor());
};
petWindow.setDragHooks({
  start: () => popoverWindow.hold(true),
  move: (bounds) => popoverPetRect && popoverWindow.follow(toScreenRect(bounds, popoverPetRect)),
  end: () => popoverWindow.hold(false),
});

// The pet clears its speech bubble while the popover hangs from it (from the menu bar icon it does not cover the pet).
popoverWindow.onVisibility((visible) => petWindow.send('pet:popover-open', visible && popoverPetRect !== null));

function togglePref(key) {
  prefs.toggle(key);
  panelWindow.send();
  settingsWindow.send();
  petWindow.send('pet:prefs', prefs.petPrefs());
}

// ---------- Events ----------

petService.on('status', (status) => {
  petWindow.send('pet:status', status);
  shareWindow.send('share:status', status);
  panelWindow.send();
  settingsWindow.send(); // account and repos change when the setup flow finishes
  popoverWindow.send();
  refreshTrayMenu();
});
petService.on('evolved', (stage) => petWindow.send('pet:evolved', stage));
petService.on('activity', (delta) => petWindow.send('pet:activity', delta));
petService.on('levelUp', (level, info) => petWindow.send('pet:level-up', { level, ...info }));
petService.on('companion', (companion) => petWindow.send('pet:companion', companion));
petService.on('achievements', (list) => petWindow.send('pet:achievements', list));

updater.on('change', () => {
  panelWindow.send();
  settingsWindow.send();
  refreshTrayMenu();
});

// --- cloud save (optional) ---
petService.on('status', () => cloud.schedulePush());
petService.on('configured', () => cloud.schedulePush({ now: true }));
cloud.on('pulled', () => petService.notify());
cloud.on('status', () => settingsWindow.send());

// Write pending changes before quitting, without hanging if GitHub is slow.
let flushedOnQuit = false;
app.on('before-quit', (event) => {
  if (flushedOnQuit || !cloud.isEnabled()) return;
  event.preventDefault();
  flushedOnQuit = true;
  const timeout = new Promise((resolve) => setTimeout(resolve, CLOUD.QUIT_FLUSH_TIMEOUT_MS));
  Promise.race([cloud.flush(), timeout]).finally(() => app.quit());
});
// --- end cloud save ---

// ---------- Lifecycle ----------

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => (petService.isConfigured() ? petWindow.show() : actions.openSetup()));

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark'; // the design is synthwave, dark only: scrollbars, menus and title bars follow it
  if (IS_MAC) app.dock?.hide();
  else Menu.setApplicationMenu(null); // no File/Edit/View bar over the windows
  registerIpc(actions);
  loginItem.applyDefault();
  panelWindow.init(actions.panelState);
  popoverWindow.init(actions.panelState);
  settingsWindow.init(actions.settingsState);
  tray = createTray();
  // The icon is the menu (a click or a right-click); the card hangs from the pet. On Linux the menu is a native one.
  if (IS_LINUX) refreshTrayMenu();
  else {
    const toggleMenu = () => panelWindow.toggle(trayAnchor());
    tray.on('click', toggleMenu);
    tray.on('right-click', toggleMenu);
  }

  if (petService.isConfigured()) {
    petWindow.show();
    cloud.pull().finally(() => petService.sync());
  } else {
    actions.openSetup();
  }

  petService.startPolling();
  updater.start();
  // --- live reactions (local pushes + PR watcher) ---
  startLive({ petService, powerMonitor });
  // --- end live reactions ---
  setInterval(() => petService.notify(), TICK_INTERVAL_MS);
  setInterval(() => cloud.pull(), CLOUD.PULL_INTERVAL_MS);
  powerMonitor.on('resume', () => cloud.pull().finally(actions.sync));
  screen.on('display-removed', petWindow.ensureOnScreen);
});

// Lives in the menu bar (the tray on Windows and Linux): closing windows doesn't quit the app.
app.on('window-all-closed', () => {});
