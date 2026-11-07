// IPC contract between main and renderers. Must match src/preload/preload.js.
const { ipcMain } = require('electron');
const store = require('./store');
const session = require('./services/session');
const petService = require('./services/pet-service');
const cloud = require('./cloud/cloud-sync');
const petWindow = require('./ui/pet-window');
const panelWindow = require('./ui/panel-window');
const popoverWindow = require('./ui/popover-window');
const settingsWindow = require('./ui/settings-window');
const prefs = require('./prefs');
const catalog = require('./game/catalog');
const collection = require('./game/collection');
const evolutionWindow = require('./ui/evolution-window');
const { copyRegion } = require('./ui/share');
const profileWindow = require('./ui/profile-window');

// Only accept messages from our own local pages.
const isTrusted = (event) => event.senderFrame?.url.startsWith('file://');

function handle(channel, fn) {
  ipcMain.handle(channel, (event, payload) => {
    if (!isTrusted(event)) throw new Error('Untrusted sender');
    return fn(payload);
  });
}

function on(channel, fn) {
  ipcMain.on(channel, (event, payload) => isTrusted(event) && fn(payload));
}

// ---- everyday UI (menu bar dropdown, PR popover) ----
// Dropdown rows. Actions in KEEP_OPEN update the dropdown in place; the rest close it first.
const PANEL_ACTIONS = [
  'sync',
  'togglePet',
  'toggleDoNotDisturb',
  'openPopover',
  'openProfile',
  'openCollection',
  'openSettings',
  'quit',
];
const KEEP_OPEN = new Set(['sync', 'togglePet', 'toggleDoNotDisturb']);
// Popover buttons and header: they close the popover first.
const POPOVER_ACTIONS = ['openProfile', 'openCollection', 'openSettings'];
// ---- end everyday UI ----

// Settings window controls.
const SETTINGS_ACTIONS = [
  'toggleSpeechBubbles',
  'toggleNotifications',
  'toggleMenuBarCount',
  'toggleTimeOff',
  'toggleOpenAtLogin',
  'toggleCloudSync',
  'openSaveRepo',
  'openSetup',
];

/**
 * @param {{ openProfile: () => void, finishOnboarding: () => void, showMenu: () => void, disconnect: () => void, panelState: () => object,
 *           setPetSize: (size: number, persist?: boolean) => void, togglePopover: (rect: object) => void,
 *           openPullRequest: (url: string) => void }} actions
 */
function registerIpc(actions) {
  // App
  handle('app:bootstrap', () => {
    const { user, repos, pets, activePet } = store.get();
    return {
      user,
      repos,
      pet: pets[activePet] ?? null, // the active pet: the setup flow preselects it
      catalog: {
        species: catalog.SPECIES,
        stages: catalog.STAGES,
        xpRules: catalog.XP_RULES,
        nameMax: collection.NAME_MAX,
      },
      status: petService.status(),
    };
  });

  // Session
  // Both return their result or { error, message }: Errors lose their `code` across IPC.
  const attempt = async (fn) => {
    try {
      return await fn();
    } catch (err) {
      return { error: err.code ?? 'UNKNOWN', message: err.message };
    }
  };
  handle('auth:accounts', () => attempt(session.listAccounts));
  handle('auth:connect', (login) => attempt(async () => ({ user: await session.connect(login) })));
  handle('auth:disconnect', () => actions.disconnect());

  // Onboarding
  handle('repos:list', () => petService.listRepos());
  handle('onboarding:finish', async ({ cloudSync, ...choice }) => {
    await petService.configure(choice);
    actions.finishOnboarding();
    if (cloudSync) cloud.enable();
  });

  // Cloud save (optional): find / restore a pet saved in the user's GitHub account.
  handle('cloud:find', () => attempt(() => cloud.find()));
  handle('cloud:restore', async () => {
    await cloud.restore();
    actions.finishOnboarding();
    petService.sync();
  });

  // The collection: every window can switch pets. Each returns nothing or { error, message }.
  handle('pets:activate', (species) => attempt(() => petService.activate(species)));
  handle('pets:hatch', (choice) => attempt(() => petService.hatch(choice ?? {})));
  handle('pets:rename', (choice) => attempt(() => petService.rename(choice ?? {})));

  // Pet
  handle('pet:status', () => petService.status());
  handle('pet:refresh', () => petService.sync());
  on('pet:click-through', (enabled) => petWindow.setClickThrough(Boolean(enabled)));
  on('pet:drag-start', ({ offsetX, offsetY }) =>
    petWindow.startDrag({ offsetX: Number(offsetX), offsetY: Number(offsetY) }),
  );
  on('pet:drag-end', () => petWindow.stopDrag());
  on('pet:menu', () => actions.showMenu());
  handle('pet:size', () => petWindow.size());
  // ---- everyday UI ----
  handle('pet:prefs', () => prefs.petPrefs());
  on('pet:popover', (rect) => {
    const { x, y, width, height } = rect ?? {};
    if ([x, y, width, height].every(Number.isFinite)) actions.togglePopover({ x, y, width, height });
  });
  // ---- end everyday UI ----

  // --- Profile & evolution windows ---
  handle('profile:status', () => petService.status());
  handle('profile:view', () => profileWindow.takeView());
  // The share card: copies the part of the window it is drawn in to the clipboard, as an image. It needs the window
  // that asked, so it does not go through `handle`.
  ipcMain.handle('profile:copy-card', (event, rect) => {
    if (!isTrusted(event)) throw new Error('Untrusted sender');
    return copyRegion(event.sender, rect);
  });
  handle('evolution:data', () => evolutionWindow.current());
  on('evolution:close', () => evolutionWindow.close());
  on('evolution:view-profile', (view) => {
    evolutionWindow.close();
    actions.openProfile(view);
  });
  // --- end Profile & evolution windows ---

  // ---- everyday UI ----
  // Panel (menu bar dropdown)
  handle('panel:state', () => actions.panelState());
  on('panel:action', (name) => {
    if (!PANEL_ACTIONS.includes(name)) return;
    if (!KEEP_OPEN.has(name)) panelWindow.hide();
    actions[name]();
  });
  on('panel:height', (height) => Number.isFinite(height) && panelWindow.setHeight(height));

  // Popover (PRs)
  handle('popover:state', () => popoverWindow.state());
  on('popover:action', (name) => {
    if (!POPOVER_ACTIONS.includes(name)) return;
    popoverWindow.hide();
    actions[name]();
  });
  on('popover:open-pr', (url) => typeof url === 'string' && actions.openPullRequest(url));
  on('popover:height', (height) => Number.isFinite(height) && popoverWindow.setHeight(height));
  // ---- end everyday UI ----

  // Settings
  handle('settings:state', () => settingsWindow.state());
  on('settings:action', (name) => SETTINGS_ACTIONS.includes(name) && actions[name]());
  on('settings:size', ({ size, commit } = {}) => actions.setPetSize(Number(size), Boolean(commit)));
  // The day the person is back from time off ('YYYY-MM-DD'), or null for none; the service checks it is a real day.
  on('settings:time-off-return', (day) => actions.setTimeOffReturn(typeof day === 'string' ? day : null));
}

module.exports = { registerIpc };
