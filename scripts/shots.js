// `npm run shots [-- page ...] [--light] [--mine] [--tab view] [--tall] [--celebrate] [--out dir]`: renders the app windows with sample data to PNG files,
// so a UI change can be checked by eye without running the app. Pages: profile popover panel settings evolution pet.
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const config = require(path.join(ROOT, 'src/main/config.js'));
const catalog = require(path.join(ROOT, 'src/main/game/catalog.js'));
const { computeStatus } = require(path.join(ROOT, 'src/main/game/engine.js'));
const { reviewQueue } = require(path.join(ROOT, 'src/main/game/pull-requests.js'));

const flagValues = new Set(['--out', '--tab'].map((f) => process.argv[process.argv.indexOf(f) + 1]));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && !flagValues.has(a));
const outFlag = process.argv.indexOf('--out');
const outDir = outFlag > -1 ? process.argv[outFlag + 1] : path.join(os.tmpdir(), 'gitgotchi-shots');
const light = process.argv.includes('--light');
const mine = process.argv.includes('--mine'); // popover: open on "My PRs" (an empty review queue makes it the default tab)
const celebrate = process.argv.includes('--celebrate'); // pet: new achievements arrive (the cheer and the bubble)
const tall = process.argv.includes('--tall'); // a much taller window, to see content that scrolls
const tab = process.argv.includes('--tab') ? process.argv[process.argv.indexOf('--tab') + 1] : null; // profile: a view
const PAGES = {
  profile: { size: config.PROFILE_WINDOW },
  evolution: { size: config.EVOLUTION_WINDOW },
  settings: { size: config.SETTINGS_WINDOW },
  popover: { size: { width: config.POPOVER_WINDOW.width, height: 1000 }, fit: true },
  panel: { size: { width: config.PANEL_WINDOW.width, height: 1000 }, fit: true },
  pet: { size: config.PET_WINDOW },
};
const pages = args.filter((a) => a in PAGES);

// ---------- Fixtures ----------

const NOW = new Date();
const dayKey = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const H = 3600000;
const pr = (id, title, repo, lines, extra = {}) => ({
  id: `pr${id}`,
  number: 1000 + id,
  title,
  url: `https://github.com/${repo}/pull/${1000 + id}`,
  repo,
  state: 'OPEN',
  isDraft: false,
  reviewDecision: null,
  ci: 'SUCCESS',
  lines,
  createdAt: ago(30 * H),
  mergedAt: null,
  ...extra,
});

const days = {
  [dayKey(0)]: { prs: 1, prsXp: 20, reviews: 3, merges: 1, commits: 4, issues: 0 },
  [dayKey(1)]: { prs: 2, prsXp: 30, reviews: 5, merges: 2, commits: 8, issues: 1 },
  [dayKey(2)]: { prs: 1, prsXp: 10, reviews: 2, merges: 0, commits: 3, issues: 0 },
  [dayKey(4)]: { prs: 0, prsXp: 0, reviews: 6, merges: 1, commits: 10, issues: 0 },
  [dayKey(5)]: { prs: 3, prsXp: 40, reviews: 1, merges: 1, commits: 6, issues: 2 },
};
const prs = [
  pr(1, 'EXT-3303: Offer to match a new component with its design system token', 'webflow/webflow', 240, {
    createdAt: ago(60 * H),
    ci: 'FAILURE',
  }),
  pr(2, '[EXT-2655] Add library.variables to the export API', 'webflow/webflow-cli', 18, { ci: 'PENDING' }),
  pr(3, 'Skip the See logs footer when there are none', 'webflow/webflow-cli', 6, {
    reviewDecision: 'CHANGES_REQUESTED',
  }),
  pr(4, 'Strip exported library metadata', 'webflow/webflow-cli', 410, { reviewDecision: 'APPROVED' }),
  pr(5, 'Make library variables optional', 'webflow/webflow', 90, {
    state: 'MERGED',
    mergedAt: ago(2 * H),
    createdAt: ago(40 * H),
  }),
];
const repos = ['webflow/webflow', 'webflow/webflow-cli'];
const pet = { name: 'Mergon', species: 'phoenix', bornAt: ago(20 * 24 * H), stageIndex: 1, level: 6 };
const status = computeStatus({ pet, activity: { days, prs, commits: [] }, repos }, NOW);
status.reviewQueue = reviewQueue(
  [
    { ...pr(11, 'Fix flaky editor selection test', 'webflow/webflow', 35), author: 'ana-dev' },
    { ...pr(12, 'Bump design tokens to 4.2', 'webflow/webflow-cli', 520), author: 'lee-ui', createdAt: ago(80 * H) },
  ],
  repos,
  NOW,
);

if (mine) status.reviewQueue = [];
const fixtures = {
  celebrate: celebrate
    ? [{ id: 'first-merge', name: 'First merge', description: 'Get a pull request merged', icon: 'merge' }]
    : null,
  status,
  catalog: { species: catalog.SPECIES, stages: catalog.STAGES, xpRules: catalog.XP_RULES },
  petSize: config.DEFAULT_PET_SIZE,
  panel: {
    status,
    configured: true,
    connected: true,
    petVisible: true,
    speechBubbles: true,
    doNotDisturb: false,
    openAtLogin: false,
    cloudSync: { enabled: false },
    petSize: config.DEFAULT_PET_SIZE,
    sizeRange: config.PET_SIZE_RANGE,
  },
  settings: {
    login: 'sample-user',
    repoCount: repos.length,
    speechBubbles: true,
    doNotDisturb: false,
    openAtLogin: false,
    cloud: { enabled: false, repo: null, saved: false, phase: null, error: null, lastPushAt: null },
    petSize: config.DEFAULT_PET_SIZE,
    sizeRange: config.PET_SIZE_RANGE,
    defaultPetSize: config.DEFAULT_PET_SIZE,
  },
};
process.env.SHOTS_FIXTURES = JSON.stringify(fixtures);

// ---------- Render ----------

async function shot(name) {
  const { fit } = PAGES[name];
  const size = tall ? { ...PAGES[name].size, height: 1500 } : PAGES[name].size;
  const win = new BrowserWindow({
    show: false,
    ...size,
    useContentSize: true,
    backgroundColor: light ? '#e8e5ef' : '#0f0d14',
    webPreferences: { preload: path.join(__dirname, 'shots-preload.js'), contextIsolation: true, sandbox: false },
  });
  await win.loadFile(path.join(ROOT, 'src/renderer', name, 'index.html'), tab ? { hash: tab } : {});
  await new Promise((resolve) => setTimeout(resolve, 1000)); // fonts, images and the first render
  const rect = fit
    ? await win.webContents.executeJavaScript(
        `(() => { const r = document.querySelector('#app').getBoundingClientRect(); return { x: 0, y: 0, width: innerWidth, height: Math.ceil(r.bottom) + 8 }; })()`,
      )
    : undefined;
  const image = await win.webContents.capturePage(rect);
  const overflowing = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.card')].filter((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).map((c) => c.className)`,
  );
  const file = path.join(
    outDir,
    `${name}${tab ? `-${tab}` : ''}${mine ? '-mine' : ''}${celebrate ? '-celebrate' : ''}${tall ? '-tall' : ''}${light ? '-light' : ''}.png`,
  );
  fs.writeFileSync(file, image.toPNG());
  return { file, overflowing };
}

// One Electron process per page: windows rendered back to back in one process can fail to load or hang.
function renderAll() {
  const { spawnSync } = require('node:child_process');
  const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
  let failed = false;
  for (const name of pages.length ? pages : Object.keys(PAGES)) {
    const run = spawnSync(process.execPath, [__filename, name, ...flags], { encoding: 'utf8', timeout: 30000 });
    const line = run.stdout.split('\n').find((l) => l.startsWith(`${name}:`));
    if (run.status !== 0 || !line) failed = true;
    console.log(line ?? `${name}: FAILED (${run.error?.message ?? 'no output'})`);
  }
  app.exit(failed ? 1 : 0);
}

app.whenReady().then(async () => {
  if (pages.length !== 1) return renderAll();
  nativeTheme.themeSource = light ? 'light' : 'dark';
  fs.mkdirSync(outDir, { recursive: true });
  const [name] = pages;
  try {
    const { file, overflowing } = await shot(name);
    console.log(`${name}: ${file}${overflowing.length ? `  OVERFLOW in: ${overflowing.join(', ')}` : ''}`);
    app.exit(overflowing.length ? 1 : 0);
  } catch (err) {
    console.log(`${name}: FAILED (${err.message})`);
    app.exit(1);
  }
});
