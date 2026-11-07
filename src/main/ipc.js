// IPC contract between main and renderers. Must match src/preload/preload.js.
const { ipcMain } = require('electron');
const store = require('./store');
const session = require('./services/session');
const petService = require('./services/pet-service');
const petWindow = require('./ui/pet-window');
const panelWindow = require('./ui/panel-window');
const catalog = require('./game/catalog');
const evolutionWindow = require('./ui/evolution-window');

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

// Panel buttons. Actions in KEEP_OPEN update the panel in place; the rest close it first.
const PANEL_ACTIONS = ['sync', 'togglePet', 'toggleOpenAtLogin', 'openSettings', 'disconnect', 'quit'];
const KEEP_OPEN = new Set(['sync', 'togglePet', 'toggleOpenAtLogin']);

/**
 * @param {{ openProfile: () => void, finishOnboarding: () => void, showMenu: () => void, disconnect: () => void, panelState: () => object,
 *           setPetSize: (size: number, persist?: boolean) => void }} actions
 */
function registerIpc(actions) {
  // App
  handle('app:bootstrap', () => {
    const { user, repos, pet } = store.get();
    return {
      user,
      repos,
      pet,
      catalog: { species: catalog.SPECIES, stages: catalog.STAGES, weights: catalog.WEIGHTS },
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
  handle('onboarding:finish', async (choice) => {
    await petService.configure(choice);
    actions.finishOnboarding();
  });

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

  // --- Profile & evolution windows ---
  handle('profile:status', () => petService.status());
  handle('evolution:data', () => evolutionWindow.current());
  on('evolution:close', () => evolutionWindow.close());
  on('evolution:view-profile', () => {
    evolutionWindow.close();
    actions.openProfile();
  });
  // --- end Profile & evolution windows ---

  // Panel
  handle('panel:state', () => actions.panelState());
  on('panel:action', (name) => {
    if (!PANEL_ACTIONS.includes(name)) return;
    if (!KEEP_OPEN.has(name)) panelWindow.hide();
    actions[name]();
  });
  on('panel:size', ({ size, commit }) => actions.setPetSize(Number(size), Boolean(commit)));
  on('panel:height', (height) => Number.isFinite(height) && panelWindow.setHeight(height));
}

module.exports = { registerIpc };
