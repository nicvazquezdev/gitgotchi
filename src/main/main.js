// Entry point: app lifecycle and wiring between services and UI.
const { app, screen, powerMonitor } = require('electron');
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
const store = require('./store');
const prefs = require('./prefs');
const { registerIpc } = require('./ipc');
const loginItem = require('./login-item');
const { startLive } = require('./live');
const cloud = require('./cloud/cloud-sync');

let tray = null;

// "Nudge reviewers" opens at most this many PRs at once (a long waiting list must not flood the browser).
const MAX_NUDGE_TABS = 10;

// ---------- App actions ----------

// --- Profile & evolution windows ---
// An evolution that happens in Do Not Disturb waits here ({ fromIndex, toIndex }, merged if several pile up)
// and is shown by `flushEvolution`: on the next status update after DnD turns off, or when the menu opens.
let pendingEvolution = null;

const actions = {
  openProfile: () => profileWindow.open(),
  celebrateEvolution: ({ index }) => {
    pendingEvolution = { fromIndex: pendingEvolution?.fromIndex ?? index - 1, toIndex: index };
    actions.flushEvolution();
  },
  flushEvolution: () => {
    if (!pendingEvolution || prefs.doNotDisturb()) return;
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
  showMenu: () => {
    actions.flushEvolution();
    actions.refreshReviews();
    const { x, y } = screen.getCursorScreenPoint();
    panelWindow.show({ x, y, width: 0, height: 0 });
  },
  // --- everyday UI: menu bar dropdown, PR popover, pet bubble ---
  toggleSpeechBubbles: () => togglePref('speechBubbles'),
  toggleDoNotDisturb: () => togglePref('doNotDisturb'),
  // The pet page knows where the creature is: it answers with the rect to anchor on (`togglePopover`).
  openPopover: () => (petWindow.isVisible() ? petWindow.send('pet:popover-request') : popoverWindow.show(trayAnchor())),
  /** `rect`: the creature's rect in the pet window's own coordinates. */
  togglePopover: (rect) => {
    actions.refreshReviews();
    const win = petWindow.window;
    popoverWindow.toggle(win && petWindow.isVisible() ? toScreenRect(win.getBounds(), rect) : trayAnchor());
  },
  // The review queue is also fetched when a window that shows it opens (not more than every few seconds).
  refreshReviews: () => petService.refreshReviews({ maxAgeMs: LIVE.REVIEW_QUEUE_OPEN_REFRESH_MS }),
  // Only opens PR pages in the browser; it never writes to GitHub.
  // The review queue is sorted oldest first: the one that has waited longest is the first to open.
  reviewOldest: () => {
    const [oldest] = petService.status().reviewQueue ?? [];
    if (oldest) openGithub(oldest.url);
  },
  nudgeReviewers: () =>
    (petService.status().prs?.waiting ?? []).slice(0, MAX_NUDGE_TABS).forEach(({ url }) => openGithub(url)),
  openPullRequest: (url) => openGithub(url),
  // --- end everyday UI ---
  panelState: () => ({
    status: petService.status(),
    configured: petService.isConfigured(),
    connected: session.isConnected(),
    petVisible: petWindow.isVisible(),
    doNotDisturb: prefs.doNotDisturb(),
  }),
  settingsState: () => {
    const { user, repos } = store.get();
    return {
      login: user?.login ?? null,
      repoCount: repos.length,
      speechBubbles: prefs.speechBubbles(),
      doNotDisturb: prefs.doNotDisturb(),
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

function togglePref(key) {
  prefs.toggle(key);
  panelWindow.send();
  settingsWindow.send();
  petWindow.send('pet:prefs', prefs.petPrefs());
}

// ---------- Events ----------

petService.on('status', (status) => {
  petWindow.send('pet:status', status);
  profileWindow.send('profile:status', status);
  panelWindow.send();
  settingsWindow.send(); // account and repos change when the setup flow finishes
  popoverWindow.send();
  actions.flushEvolution();
});
petService.on('evolved', (stage) => {
  petWindow.send('pet:evolved', stage);
  actions.celebrateEvolution(stage);
});
petService.on('activity', (delta) => petWindow.send('pet:activity', delta));

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
  if (IS_MAC) app.dock?.hide();
  registerIpc(actions);
  loginItem.applyDefault();
  panelWindow.init(actions.panelState);
  popoverWindow.init(actions.panelState);
  settingsWindow.init(actions.settingsState);
  tray = createTray();
  const toggleMenu = () => {
    actions.flushEvolution();
    actions.refreshReviews();
    panelWindow.toggle(tray.getBounds());
  };
  tray.on('click', toggleMenu);
  tray.on('right-click', toggleMenu);

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
