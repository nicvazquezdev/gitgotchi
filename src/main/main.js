// Entry point: app lifecycle and wiring between services and UI.
const { app, screen, powerMonitor, systemPreferences, nativeTheme } = require('electron');
const { IS_MAC, PET_SIZE_RANGE, DEFAULT_PET_SIZE, TICK_INTERVAL_MS, CLOUD, LIVE } = require('./config');

const session = require('./services/session');
const petService = require('./services/pet-service');
const petWindow = require('./ui/pet-window');
const onboardingWindow = require('./ui/onboarding-window');
const panelWindow = require('./ui/panel-window');
const profileWindow = require('./ui/profile-window');
const settingsWindow = require('./ui/settings-window');
const evolutionWindow = require('./ui/evolution-window');
const popoverWindow = require('./ui/popover-window');
const { toScreenRect } = require('./ui/popover-position');
const { openGithub } = require('./ui/external-links');
const { createTray } = require('./ui/tray');
const { createNotifier } = require('./ui/notifier');
const store = require('./store');
const prefs = require('./prefs');
const { registerIpc } = require('./ipc');
const loginItem = require('./login-item');
const { startLive } = require('./live');
const cloud = require('./cloud/cloud-sync');

let tray = null;

// macOS reopens the windows of an app that was killed or quit while it was starting, and asks "The last time you
// opened … it unexpectedly quit while reopening windows". This app builds its own windows and restarts a lot in
// development (the old process is killed), so it never wants that: it asks macOS not to restore anything.
// Both are read from the app's own preferences, so they take effect from the next launch on.
if (IS_MAC) {
  systemPreferences.setUserDefault('ApplePersistenceIgnoreState', 'boolean', true);
  systemPreferences.setUserDefault('NSQuitAlwaysKeepsWindows', 'boolean', false);
}

// ---------- App actions ----------

// --- Profile & evolution windows ---
// An evolution that happens during a pause waits here ({ fromIndex, toIndex }, merged if several pile up)
// and is shown by `flushEvolution`: on the next status update after the pause ends, or when the menu opens.
let pendingEvolution = null;

const actions = {
  openProfile: (view) => profileWindow.open(view),
  openXp: () => profileWindow.open('xp'),
  celebrateEvolution: ({ index }) => {
    pendingEvolution = { fromIndex: pendingEvolution?.fromIndex ?? index - 1, toIndex: index };
    actions.flushEvolution();
  },
  flushEvolution: () => {
    if (!pendingEvolution || petService.isPaused()) return;
    evolutionWindow.open(pendingEvolution);
    pendingEvolution = null;
  },
  // --- end Profile & evolution windows ---
  sync: () => petService.sync(),
  togglePet: () => {
    if (petWindow.isVisible()) petWindow.hide();
    else petWindow.show();
    panelWindow.send();
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
  // --- pause (see game/pause.js): the menu and Settings share these; the status that follows updates every window ---
  pauseHour: () => petService.startPause('hour'),
  pauseTomorrow: () => petService.startPause('tomorrow'),
  // A vacation starts with no set return; Settings is where the person picks the day they are back.
  pauseVacation: () => {
    petService.startPause('vacation');
    actions.openSettings();
  },
  resume: () => petService.resume(),
  setPauseReturn: (day) => petService.setTimeOffReturn(day),
  // --- end pause ---
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
    actions.flushEvolution();
    actions.refreshReviews();
    const { x, y } = screen.getCursorScreenPoint();
    panelWindow.show({ x, y, width: 0, height: 0 });
  },
  // --- everyday UI: menu bar dropdown, PR popover, pet bubble ---
  toggleSpeechBubbles: () => togglePref('speechBubbles'),
  toggleNotifications: () => togglePref('notifications'),
  // The pet page knows where the creature is: it answers with the rect to anchor on (`togglePopover`).
  /** `rect`: the creature's rect in the pet window's own coordinates. */
  togglePopover: (rect) => {
    actions.refreshReviews();
    const win = petWindow.window;
    const onPet = win && petWindow.isVisible();
    popoverPetRect = onPet ? rect : null;
    popoverWindow.toggle(onPet ? toScreenRect(win.getBounds(), rect) : trayAnchor());
  },
  // The review queue is also fetched when a window that shows it opens (not more than every few seconds).
  refreshReviews: () => petService.refreshReviews({ maxAgeMs: LIVE.REVIEW_QUEUE_OPEN_REFRESH_MS }),
  // Only opens PR pages in the browser; it never writes to GitHub.
  openPullRequest: (url) => openGithub(url),
  // --- end everyday UI ---
  panelState: () => ({
    status: petService.status(),
    configured: petService.isConfigured(),
    connected: session.isConnected(),
    petVisible: petWindow.isVisible(),
  }),
  settingsState: () => {
    const { user, repos } = store.get();
    return {
      login: user?.login ?? null,
      repoCount: repos.length,
      speechBubbles: prefs.speechBubbles(),
      notifications: prefs.notifications(),
      pause: petService.pause(),
      openAtLogin: loginItem.isEnabled(),
      cloud: cloud.status(),
      petSize: petWindow.size(),
      sizeRange: PET_SIZE_RANGE,
      defaultPetSize: DEFAULT_PET_SIZE,
    };
  },
  quit: () => app.quit(),
};

const trayAnchor = () => tray.getBounds();

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

function togglePref(key) {
  prefs.toggle(key);
  panelWindow.send();
  settingsWindow.send();
  petWindow.send('pet:prefs', prefs.petPrefs());
}

// System notifications for the moments worth interrupting for (see notify-plan.js). A pause silences them.
const notifier = createNotifier({
  isEnabled: () => prefs.notifications() && !petService.isPaused(),
  openPullRequest: (url) => openGithub(url),
  openPopover: showPopoverAtTray,
});

// ---------- Events ----------

petService.on('status', (status) => {
  petWindow.send('pet:status', status);
  profileWindow.send('profile:status', status);
  panelWindow.send();
  settingsWindow.send(); // account and repos change when the setup flow finishes
  popoverWindow.send();
  actions.flushEvolution();
});
petService.on('attention', (items) => notifier.notify(items));
petService.on('evolved', (stage) => {
  petWindow.send('pet:evolved', stage);
  actions.celebrateEvolution(stage);
});
petService.on('activity', (delta) => petWindow.send('pet:activity', delta));
petService.on('levelUp', (level, info) => petWindow.send('pet:level-up', { level, ...info }));
petService.on('companion', (companion) => petWindow.send('pet:companion', companion));
petService.on('achievements', (list) => petWindow.send('pet:achievements', list));

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
  registerIpc(actions);
  loginItem.applyDefault();
  panelWindow.init(actions.panelState);
  popoverWindow.init(actions.panelState);
  settingsWindow.init(actions.settingsState);
  tray = createTray();
  // The icon opens the card (the same one the pet opens); a right-click on it opens the menu.
  tray.on('click', () => {
    actions.flushEvolution();
    actions.refreshReviews();
    popoverPetRect = null;
    popoverWindow.toggle(trayAnchor());
  });
  tray.on('right-click', () => {
    actions.flushEvolution();
    panelWindow.toggle(tray.getBounds());
  });

  if (petService.isConfigured()) {
    petWindow.show();
    cloud.pull().finally(() => petService.sync());
  } else {
    actions.openSetup();
  }

  petService.startPolling();
  // --- live reactions (local pushes + PR watcher) ---
  startLive({ petService, powerMonitor });
  // --- end live reactions ---
  setInterval(() => petService.notify(), TICK_INTERVAL_MS);
  setInterval(() => cloud.pull(), CLOUD.PULL_INTERVAL_MS);
  powerMonitor.on('resume', () => cloud.pull().finally(actions.sync));
  screen.on('display-removed', petWindow.ensureOnScreen);
});

// Lives in the menu bar: closing windows doesn't quit the app.
app.on('window-all-closed', () => {});
