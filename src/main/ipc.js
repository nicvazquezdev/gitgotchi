// IPC contract between main and renderers. Must match src/preload/preload.js.
const { ipcMain } = require('electron');
const store = require('./store');
const session = require('./services/session');
const petService = require('./services/pet-service');
const petWindow = require('./ui/pet-window');
const catalog = require('./game/catalog');

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

/** @param {{ finishOnboarding: () => void, showMenu: () => void, stepPetSize: (direction: number) => void, disconnect: () => void }} actions */
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
  // Returns { user } or { error, message }: Errors lose their `code` across IPC.
  handle('auth:connect', async () => {
    try {
      return { user: await session.connect() };
    } catch (err) {
      return { error: err.code ?? 'UNKNOWN', message: err.message };
    }
  });
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
  on('pet:size-step', (direction) => actions.stepPetSize(Math.sign(Number(direction))));
}

module.exports = { registerIpc };
