// Entry point: app lifecycle and wiring between services and UI.
const { app, screen, powerMonitor, Notification } = require('electron');
const { IS_MAC, TICK_INTERVAL_MS } = require('./config');

const session = require('./services/session');
const petService = require('./services/pet-service');
const petWindow = require('./ui/pet-window');
const onboardingWindow = require('./ui/onboarding-window');
const { createTray, buildMenu } = require('./ui/tray');
const { stepSize } = require('./ui/pet-size');
const { registerIpc } = require('./ipc');
const loginItem = require('./login-item');

let tray = null;

// ---------- App actions ----------

const actions = {
  sync: () => petService.sync(),
  togglePet: () => (petWindow.isVisible() ? petWindow.hide() : petWindow.show()),
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
    refreshMenu();
  },
  toggleOpenAtLogin: () => {
    loginItem.setEnabled(!loginItem.isEnabled());
    refreshMenu();
  },
  setPetSize: (size) => {
    petWindow.setSize(size);
    refreshMenu();
  },
  stepPetSize: (direction) => actions.setPetSize(stepSize(petWindow.size(), direction)),
  showMenu: () => menu().popup({ window: petWindow.window }),
  quit: () => app.quit(),
};

function menu() {
  return buildMenu({
    status: petService.status(),
    configured: petService.isConfigured(),
    connected: session.isConnected(),
    petVisible: petWindow.isVisible(),
    openAtLogin: loginItem.isEnabled(),
    petSize: petWindow.size(),
    actions,
  });
}

function refreshMenu() {
  tray?.setContextMenu(menu());
}

// ---------- Events ----------

petService.on('status', (status) => {
  petWindow.send('pet:status', status);
  refreshMenu();
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
  tray = createTray();
  refreshMenu();

  if (petService.isConfigured()) {
    petWindow.show();
    petService.sync();
  } else {
    actions.openSettings();
  }

  petService.startPolling();
  setInterval(() => petService.notify(), TICK_INTERVAL_MS);
  powerMonitor.on('resume', actions.sync);
  screen.on('display-removed', petWindow.ensureOnScreen);
});

// Lives in the menu bar: closing windows doesn't quit the app.
app.on('window-all-closed', () => {});
