// `npm run smoke`: boots the real app (main process, tray, IPC, every window) on a throwaway profile and fails on any
// error in a page or in the main process. CI runs it on macOS, Windows and Linux: unit tests do not cover the wiring
// that differs between systems. Nothing appears on screen and the real data is never touched.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgotchi-smoke-'));
app.setPath('userData', profile);
// No `gh`: the sync fails on purpose (nothing is read from or sent to GitHub).
process.env.GITGOTCHI_GH_PATH = path.join(profile, 'no-gh');

const { SCHEMA } = require(path.join(ROOT, 'src/main/migrations.js'));
const { SPECIES } = require(path.join(ROOT, 'src/main/game/catalog.js'));
const { newPet } = require(path.join(ROOT, 'src/main/game/collection.js'));

const species = SPECIES[0];
fs.writeFileSync(
  path.join(profile, 'state.json'),
  JSON.stringify({
    schema: SCHEMA,
    user: { login: 'smoke', name: 'Smoke', avatarUrl: null },
    repos: ['smoke/repo'],
    pets: { [species.id]: newPet(species, 'Smoke') },
    activePet: species.id,
    openAtLoginDefaulted: true, // or the app would write a login item on this machine
  }),
);

// The pages still load and run, but nothing is shown or takes the focus.
for (const method of ['show', 'showInactive', 'focus']) BrowserWindow.prototype[method] = () => {};

const problems = [];
const fail = (message) => problems.push(message);
process.on('uncaughtException', (err) => fail(`uncaught exception: ${err.stack}`));
app.on('browser-window-created', (_event, win) => {
  const { webContents } = win;
  webContents.on('console-message', (event) => event.level === 'error' && fail(`page error: ${event.message}`));
  webContents.on('did-fail-load', (_e, code, description, url) =>
    fail(`${url} failed to load: ${description} (${code})`),
  );
  webContents.on('render-process-gone', (_e, details) => fail(`a page process died: ${details.reason}`));
});

require(path.join(ROOT, 'src/main/main.js'));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const loaded = () => BrowserWindow.getAllWindows().every((win) => !win.webContents.isLoading());

app.whenReady().then(async () => {
  await wait(1500); // the tray, the pet window and the first sync
  const settings = require(path.join(ROOT, 'src/main/ui/settings-window.js'));
  const popover = require(path.join(ROOT, 'src/main/ui/popover-window.js'));
  const panel = require(path.join(ROOT, 'src/main/ui/panel-window.js'));
  const share = require(path.join(ROOT, 'src/main/ui/share-window.js'));
  const anchor = { x: 400, y: 400, width: 0, height: 0 };
  settings.open();
  share.open();
  popover.show(anchor);
  panel.show(anchor);
  for (let i = 0; i < 40 && !loaded(); i++) await wait(250);
  await wait(1000);

  const windows = BrowserWindow.getAllWindows().length;
  if (windows < 5) fail(`expected at least 5 windows (pet, settings, share, card, menu), found ${windows}`);
  console.log(`smoke: ${windows} windows on ${process.platform}, ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  - ${problem}`);
  fs.rmSync(profile, { recursive: true, force: true });
  app.exit(problems.length ? 1 : 0);
});
