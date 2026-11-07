// Entry point: app lifecycle and wiring between services and UI.
const { app, screen, powerMonitor, Notification } = require('electron');
const { IS_MAC, PET_SIZE_RANGE, TICK_INTERVAL_MS } = require('./config');

const session = require('./services/session');
const petService = require('./services/pet-service');
const petWindow = require('./ui/pet-window');
const onboardingWindow = require('./ui/onboarding-window');
const panelWindow = require('./ui/panel-window');
const { createTray } = require('./ui/tray');
const { registerIpc } = require('./ipc');
const loginItem = require('./login-item');
const { startLive } = require('./live');

let tray = null;

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
  panelState: () => ({
    status: petService.status(),
    configured: petService.isConfigured(),
    connected: session.isConnected(),
    petVisible: petWindow.isVisible(),
    openAtLogin: loginItem.isEnabled(),
    petSize: petWindow.size(),
    sizeRange: PET_SIZE_RANGE,
  }),
  quit: () => app.quit(),
};

// ---------- Events ----------

petService.on('status', (status) => {
  petWindow.send('pet:status', status);
  panelWindow.send();
});
petService.on('evolved', (stage) => {
  petWindow.send('pet:evolved', stage);
  const { name } = petService.status();
  if (Notification.isSupported()) {
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
  tray = createTray();
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
