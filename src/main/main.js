// Entry point: app lifecycle and wiring between services and UI.
const { app, screen, powerMonitor, Notification } = require('electron');
const { IS_MAC, PET_SIZE_RANGE, TICK_INTERVAL_MS } = require('./config');

const session = require('./services/session');
const petService = require('./services/pet-service');
const petWindow = require('./ui/pet-window');
const onboardingWindow = require('./ui/onboarding-window');
const panelWindow = require('./ui/panel-window');
const popoverWindow = require('./ui/popover-window');
const { toScreenRect } = require('./ui/popover-position');
const { openGithub } = require('./ui/external-links');
const { createTray, updateTray } = require('./ui/tray');
const prefs = require('./prefs');
const { registerIpc } = require('./ipc');
const loginItem = require('./login-item');
const { startLive } = require('./live');

let tray = null;

// "Nudge reviewers" opens at most this many PRs at once (a long waiting list must not flood the browser).
const MAX_NUDGE_TABS = 10;

// ---------- App actions ----------

const actions = {
  sync: () => petService.sync(),
  togglePet: () => {
    if (petWindow.isVisible()) petWindow.hide();
    else petWindow.show();
    panelWindow.send();
  },
  openSettings: () =>
    onboardingWindow.open({
      // Closing before finishing the first setup leaves nothing to show.
      onClosed: () => !petService.isConfigured() && app.quit(),
    }),
  finishOnboarding: () => {
    onboardingWindow.close();
    petWindow.show();
  },
  disconnect: () => {
    session.disconnect();
    petWindow.close();
    actions.openSettings();
  },
  toggleOpenAtLogin: () => {
    loginItem.setEnabled(!loginItem.isEnabled());
    panelWindow.send();
  },
  // Live while dragging the panel slider (`persist` false); saved on release.
  setPetSize: (size, persist = true) => petWindow.setSize(size, { persist }),
  showMenu: () => {
    const { x, y } = screen.getCursorScreenPoint();
    panelWindow.show({ x, y, width: 0, height: 0 });
  },
  // --- everyday UI: menu bar dropdown, PR popover, pet bubble ---
  toggleSpeechBubbles: () => togglePref('speechBubbles'),
  toggleDoNotDisturb: () => togglePref('doNotDisturb'),
  // TODO(lead): cloud save backend. The dropdown switch already calls this; `panelState().cloudSync` is its state.
  toggleCloudSync: () => {},
  // TODO(profile agent): open the profile window.
  openProfile: () => {},
  // The pet page knows where the creature is: it answers with the rect to anchor on (`togglePopover`).
  openPopover: () => (petWindow.isVisible() ? petWindow.send('pet:popover-request') : popoverWindow.show(trayAnchor())),
  /** `rect`: the creature's rect in the pet window's own coordinates. */
  togglePopover: (rect) => {
    const win = petWindow.window;
    popoverWindow.toggle(win && petWindow.isVisible() ? toScreenRect(win.getBounds(), rect) : trayAnchor());
  },
  // Only opens PR pages in the browser; it never writes to GitHub.
  nudgeReviewers: () =>
    (petService.status().prs?.waiting ?? []).slice(0, MAX_NUDGE_TABS).forEach(({ url }) => openGithub(url)),
  openPullRequest: (url) => openGithub(url),
  // --- end everyday UI ---
  panelState: () => ({
    status: petService.status(),
    configured: petService.isConfigured(),
    connected: session.isConnected(),
    petVisible: petWindow.isVisible(),
    speechBubbles: prefs.speechBubbles(),
    doNotDisturb: prefs.doNotDisturb(),
    openAtLogin: loginItem.isEnabled(),
    cloudSync: false, // TODO(lead): the cloud save setting
    petSize: petWindow.size(),
    sizeRange: PET_SIZE_RANGE,
  }),
  quit: () => app.quit(),
};

const trayAnchor = () => tray.getBounds();

function togglePref(key) {
  prefs.toggle(key);
  panelWindow.send();
  petWindow.send('pet:prefs', prefs.petPrefs());
}

// ---------- Events ----------

petService.on('status', (status) => {
  petWindow.send('pet:status', status);
  panelWindow.send();
  popoverWindow.send();
  if (tray) updateTray(tray, status);
});
petService.on('evolved', (stage) => {
  petWindow.send('pet:evolved', stage);
  const { name } = petService.status();
  if (Notification.isSupported() && !prefs.doNotDisturb()) {
    new Notification({ title: 'Gitgotchi', body: `${name} evolved into a ${stage.name}!`, silent: true }).show();
  }
});
petService.on('activity', (delta) => petWindow.send('pet:activity', delta));

// ---------- Lifecycle ----------

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => (petService.isConfigured() ? petWindow.show() : actions.openSettings()));

app.whenReady().then(() => {
  if (IS_MAC) app.dock?.hide();
  registerIpc(actions);
  loginItem.applyDefault();
  panelWindow.init(actions.panelState);
  popoverWindow.init(actions.panelState);
  tray = createTray();
  updateTray(tray, petService.status());
  tray.on('click', () => panelWindow.toggle(tray.getBounds()));
  tray.on('right-click', () => panelWindow.toggle(tray.getBounds()));

  if (petService.isConfigured()) {
    petWindow.show();
    petService.sync();
  } else {
    actions.openSettings();
  }

  petService.startPolling();
  // --- live reactions (local pushes + PR watcher) ---
  startLive({ petService, powerMonitor });
  // --- end live reactions ---
  setInterval(() => petService.notify(), TICK_INTERVAL_MS);
  powerMonitor.on('resume', actions.sync);
  screen.on('display-removed', petWindow.ensureOnScreen);
});

// Lives in the menu bar: closing windows doesn't quit the app.
app.on('window-all-closed', () => {});
