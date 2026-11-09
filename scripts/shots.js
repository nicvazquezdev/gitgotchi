// `npm run shots [-- page ...] [--mine] [--tab pets|pets/koi|trophies] [--tall] [--scroll] [--celebrate] [--level-up] [--time-off] [--happy] [--conflicts] [--fresh] [--complete] [--final] [--click selector ...] [--restore] [--freeze] [--out dir]`: renders the app windows with sample data to PNG files,
// so a UI change can be checked by eye without running the app. Pages: profile popover panel settings evolution pet onboarding.
// `--freeze`: the same image on every run (fixed clock, no animations, no scrollbars, no animated sprites): what
// `npm run shots:check` compares with the saved ones (see visual-check.js).
const { app, BrowserWindow, nativeTheme } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const config = require(path.join(ROOT, 'src/main/config.js'));
const catalog = require(path.join(ROOT, 'src/main/game/catalog.js'));
const { computeStatus } = require(path.join(ROOT, 'src/main/game/engine.js'));
const { earnedSince, NAME_MAX } = require(path.join(ROOT, 'src/main/game/collection.js'));
const { reviewQueue } = require(path.join(ROOT, 'src/main/game/pull-requests.js'));

const flagValues = new Set(
  process.argv.flatMap((a, i) => (['--out', '--tab', '--click'].includes(a) ? [process.argv[i + 1]] : [])),
);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--') && !flagValues.has(a));
// Its own profile folder, so a run never waits for the lock of the real app's (or touches its data).
app.setPath('userData', path.join(os.tmpdir(), 'gitgotchi-shots-profile'));
const outFlag = process.argv.indexOf('--out');
const outDir = outFlag > -1 ? process.argv[outFlag + 1] : path.join(os.tmpdir(), 'gitgotchi-shots');
const mine = process.argv.includes('--mine'); // popover: open on "My PRs" (an empty review queue makes it the default tab)
const celebrate = process.argv.includes('--celebrate'); // pet: new achievements arrive (the cheer and the bubble)
const away = process.argv.includes('--time-off'); // on time off since two days ago, back in five
const conflicts = process.argv.includes('--conflicts'); // popover: two of the PRs have merge conflicts
const happy = process.argv.includes('--happy'); // a happy pet: it merged PRs recently and nothing has waited for long
const levelUp = process.argv.includes('--level-up'); // pet: a new level (the hop and the toast)
const fresh = process.argv.includes('--fresh'); // a pet that has done nothing yet
const complete = process.argv.includes('--complete'); // a pet with every achievement
const final = process.argv.includes('--final'); // evolution: into the last stage (the pet is fully grown)
// Selectors to click, in order, before the capture (each `--click` is one).
const clicks = process.argv.flatMap((a, i) => (a === '--click' ? [process.argv[i + 1]] : []));
const restore = process.argv.includes('--restore'); // onboarding: a save of the pets was found in the account
const tall = process.argv.includes('--tall'); // a much taller window, to see content that scrolls
const scroll = process.argv.includes('--scroll'); // scroll the content to the end before the capture
const freeze = process.argv.includes('--freeze'); // a fixed clock and nothing that moves, for pixel comparisons
const tab = process.argv.includes('--tab') ? process.argv[process.argv.indexOf('--tab') + 1] : null; // profile: a view
const PAGES = {
  profile: { size: config.PROFILE_WINDOW },
  evolution: { size: config.EVOLUTION_WINDOW },
  settings: { size: config.SETTINGS_WINDOW },
  popover: { size: { width: config.POPOVER_WINDOW.width, height: 1000 }, fit: true },
  panel: { size: { width: config.PANEL_WINDOW.width, height: 1000 }, fit: true },
  pet: { size: config.PET_WINDOW },
  onboarding: { size: config.ONBOARDING_WINDOW },
};
const pages = args.filter((a) => a in PAGES);

// ---------- Fixtures ----------

const NOW = freeze ? new Date(2026, 5, 15, 12, 0, 0) : new Date();
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
  pr(1, 'Offer to match a pasted component with a design token', 'acme/web-app', 240, {
    createdAt: ago(60 * H),
    ci: 'FAILURE',
  }),
  pr(2, 'Add variables to the library export', 'acme/cli', 18, { ci: 'PENDING' }),
  pr(3, 'Skip the footer when there are no logs', 'acme/cli', 6, {
    reviewDecision: 'CHANGES_REQUESTED',
  }),
  pr(4, 'Strip extra metadata from the export', 'acme/cli', 410, { reviewDecision: 'APPROVED' }),
  pr(5, 'Make the new export option optional', 'acme/web-app', 90, {
    state: 'MERGED',
    mergedAt: ago(2 * H),
    createdAt: ago(40 * H),
  }),
];
if (conflicts) for (const p of prs) if (p.id === 'pr2' || p.id === 'pr4') p.mergeable = 'CONFLICTING';
const repos = ['acme/web-app', 'acme/cli'];
// A collection of four: the phoenix is the one being raised (it earned what the ledger above gave), the koi is a young
// one, the mushroom is fully grown and the geode just hatched. The other four species are still to hatch.
// `--fresh`: only a phoenix that has done nothing yet.
if (away) for (const n of [0, 1, 2]) delete days[dayKey(n)]; // nothing done while away
const history = fresh ? { days: {}, prs: [], commits: [] } : { days, prs, commits: [] };
const pet = (species, name, daysOld, earned, extra) => ({
  species,
  name,
  bornAt: ago(daysOld * 24 * H),
  earned,
  ...extra,
});
const phoenix = pet('phoenix', 'Mergon', 20, {}, { stageIndex: 1, level: 6 });
phoenix.earned = earnedSince(history.days, phoenix.bornAt);
const pets = fresh
  ? { phoenix: { ...phoenix, stageIndex: null, level: undefined } }
  : {
      phoenix,
      koi: pet('koi', 'Finn', 40, { [dayKey(12)]: 380, [dayKey(20)]: 180 }, { stageIndex: 2, level: 10 }),
      mushroom: pet('mushroom', 'Moss', 90, { [dayKey(30)]: 900, [dayKey(50)]: 600 }, { stageIndex: 3, level: 18 }),
      geode: pet('geode', 'Pebbit', 3, { [dayKey(8)]: 30 }, { stageIndex: 0, level: 2 }),
    };
if (pets.mushroom) pets.mushroom.matureAt = dayKey(30);
const achievements = complete ? Object.fromEntries(catalog.ACHIEVEMENTS.map((a) => [a.id, dayKey(1)])) : undefined;
const timeOff = away ? [{ from: dayKey(2), to: dayKey(-4) }] : [];
const status = computeStatus({ pets, activePet: 'phoenix', achievements, activity: history, repos, timeOff }, NOW);
status.reviewQueue = reviewQueue(
  [
    // Asked 25 minutes ago: a review now still earns the fast-review bonus.
    {
      ...pr(11, 'Fix flaky editor selection test', 'acme/web-app', 35),
      author: 'ana-dev',
      requestedAt: ago(25 * 60000),
    },
    {
      ...pr(12, 'Bump design tokens to 4.2', 'acme/cli', 520),
      author: 'lee-ui',
      createdAt: ago(80 * H),
      requestedAt: ago(70 * H),
      via: 'acme/code',
    },
    // The date of the request could not be proved: the row says how old the PR is and does not flag it as late.
    {
      ...pr(13, 'Add keyboard shortcuts to the navigator', 'acme/web-app', 140),
      author: 'sam',
      createdAt: ago(9 * 24 * H),
    },
  ],
  repos,
  NOW,
);

if (mine) status.reviewQueue = [];
if (happy) Object.assign(status, { mood: 'happy', moodLabel: 'Happy', moodReason: '2 PRs merged recently' });
const fixtures = {
  freeze: freeze ? NOW.getTime() : null,
  evolution: final ? { fromIndex: 2, toIndex: 3 } : { fromIndex: 0, toIndex: 1 },
  levelUp: levelUp ? { level: 10, name: 'Mergon', toNext: 48 } : null,
  celebrate: celebrate
    ? [
        {
          id: 'first-merge',
          name: 'First merge',
          description: 'Get a pull request merged',
          icon: 'merge',
          tier: 'bronze',
          points: 10,
        },
      ]
    : null,
  status,
  catalog: { species: catalog.SPECIES, stages: catalog.STAGES, xpRules: catalog.XP_RULES, nameMax: NAME_MAX },
  petSize: config.DEFAULT_PET_SIZE,
  onboarding: {
    accounts: [{ login: 'sample-user', active: true, avatarUrl: null }],
    repos: [
      { fullName: 'acme/web-app', private: true, recent: 6, pushedAt: ago(2 * H) },
      { fullName: 'acme/cli', private: true, recent: 3, pushedAt: ago(30 * H) },
      { fullName: 'acme/design-tokens', private: false, recent: 0, pushedAt: ago(3 * 24 * H) },
      { fullName: 'acme/docs', private: false, recent: 0, pushedAt: ago(14 * 24 * H) },
      { fullName: 'acme/infra', private: true, recent: 0, pushedAt: ago(90 * 24 * H) },
      { fullName: 'sample-user/dotfiles', private: false, recent: 0, pushedAt: ago(400 * 24 * H) },
    ],
    save: restore
      ? { found: true, pet: { name: 'Mergon', speciesId: 'phoenix', stageIndex: 1, level: 9, count: 4 } }
      : { found: false },
  },
  panel: {
    status,
    configured: true,
    connected: true,
    petVisible: true,
    speechBubbles: true,
    openAtLogin: false,
    cloudSync: { enabled: false },
    petSize: config.DEFAULT_PET_SIZE,
    sizeRange: config.PET_SIZE_RANGE,
  },
  settings: {
    login: 'sample-user',
    repoCount: repos.length,
    speechBubbles: true,
    notifications: true,
    pause: status.pause,
    openAtLogin: false,
    cloud: { enabled: false, repo: null, saved: false, phase: null, error: null, lastPushAt: null },
    petSize: config.DEFAULT_PET_SIZE,
    sizeRange: config.PET_SIZE_RANGE,
    defaultPetSize: config.DEFAULT_PET_SIZE,
  },
};
process.env.SHOTS_FIXTURES = JSON.stringify(fixtures);

// ---------- Render ----------

/** For `--freeze`: check that the page's clock is the fixed one, and stop everything that moves. */
async function settle(win) {
  const clock = await win.webContents.executeJavaScript('Date.now()');
  if (clock !== NOW.getTime()) throw new Error(`the clock is not frozen (${clock}), see shots-preload.js`);
  await win.webContents.insertCSS(
    `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
     canvas { visibility: hidden !important; }
     ::-webkit-scrollbar { display: none !important; }`,
  );
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)');
  await new Promise((resolve) => setTimeout(resolve, 200));
}

async function shot(name) {
  const { fit } = PAGES[name];
  const size = tall ? { ...PAGES[name].size, height: 1500 } : PAGES[name].size;
  const win = new BrowserWindow({
    show: false,
    ...size,
    useContentSize: true,
    backgroundColor: '#120726',
    webPreferences: { preload: path.join(__dirname, 'shots-preload.js'), contextIsolation: true, sandbox: false },
  });
  await win.loadFile(path.join(ROOT, 'src/renderer', name, 'index.html'), tab ? { hash: tab } : {});
  await new Promise((resolve) => setTimeout(resolve, 1000)); // fonts, images and the first render
  if (freeze) await settle(win);
  const rect = fit
    ? await win.webContents.executeJavaScript(
        `(() => { const r = document.querySelector('#app').getBoundingClientRect(); return { x: 0, y: 0, width: innerWidth, height: Math.ceil(r.bottom) + 8 }; })()`,
      )
    : undefined;
  for (const selector of clicks) {
    await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (scroll) {
    await win.webContents.executeJavaScript(`document.querySelector('#app').scrollTop = 1e6`);
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  const image = await win.webContents.capturePage(rect);
  const overflowing = await win.webContents.executeJavaScript(
    `[...document.querySelectorAll('.card')].filter((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1).map((c) => c.className)`,
  );
  const file = path.join(
    outDir,
    `${name}${tab ? `-${tab.replace(/\W+/g, '-')}` : ''}${mine ? '-mine' : ''}${celebrate ? '-celebrate' : ''}${levelUp ? '-level-up' : ''}${away ? '-time-off' : ''}${happy ? '-happy' : ''}${conflicts ? '-conflicts' : ''}${fresh ? '-fresh' : ''}${complete ? '-complete' : ''}${final ? '-final' : ''}${restore ? '-restore' : ''}${clicks.length ? `-clicked${clicks.length > 1 ? clicks.length : ''}` : ''}${tall ? '-tall' : ''}${scroll ? '-scrolled' : ''}.png`,
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
  nativeTheme.themeSource = 'dark';
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
