// `npm run shots:check`: renders the app windows with sample data (shots.js --freeze) and compares each one with the
// screenshot saved in test/visual/. A window that changed, grew, shrank or overflows fails. `npm run shots:update`
// saves the current screenshots as the new references: look at the changes (git diff shows the images) before
// committing them.
//
// The references are made on macOS; another system or font rendering may need its own (`shots:update`).
// It needs Electron, so it is not part of `npm test` (CI installs the project without the Electron binary).
const { app, nativeImage } = require('electron');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { compareBitmaps, MAX_DIFFERENT_RATIO } = require('./visual-compare');

const ROOT = path.join(__dirname, '..');
const BASELINES = path.join(ROOT, 'test/visual');
const FAILURES = path.join(BASELINES, '__failures__');
const update = process.argv.includes('--update');
const only = process.argv.slice(2).filter((a) => !a.startsWith('--')); // case names, to run just some

// One window per case. The pet window is not here: it is drawn with randomness and a clock of its own, so it has
// checks (pet-view and the animator tests) but no reference image.
const CASES = [
  { name: 'profile-dark', page: 'profile', flags: [] },
  { name: 'profile-light', page: 'profile', flags: ['--light'] },
  { name: 'profile-achievements-dark', page: 'profile', flags: ['--tab', 'achievements'] },
  { name: 'popover-review-dark', page: 'popover', flags: [] },
  { name: 'popover-review-light', page: 'popover', flags: ['--light'] },
  { name: 'popover-mine-dark', page: 'popover', flags: ['--mine'] },
  { name: 'panel-dark', page: 'panel', flags: [] },
  { name: 'panel-light', page: 'panel', flags: ['--light'] },
  { name: 'settings-dark', page: 'settings', flags: [] },
  { name: 'settings-light', page: 'settings', flags: ['--light'] },
  { name: 'evolution-dark', page: 'evolution', flags: [] },
];

/** Renders one case with shots.js. Returns the PNG path, or an error message. */
function render({ page, flags }, outDir) {
  const run = spawnSync(
    process.execPath,
    [path.join(__dirname, 'shots.js'), page, ...flags, '--freeze', '--out', outDir],
    { encoding: 'utf8', timeout: 90000 },
  );
  const line = run.stdout.split('\n').find((l) => l.startsWith(`${page}:`));
  if (!line || line.includes('FAILED'))
    return { error: line ?? `no output (${run.error?.message ?? run.stderr.slice(0, 200)})` };
  const [file, overflow] = line
    .slice(page.length + 1)
    .trim()
    .split('  OVERFLOW in: ');
  return { file, overflow };
}

const bitmapOf = (file) => {
  const image = nativeImage.createFromPath(file);
  const { width, height } = image.getSize();
  return { width, height, data: image.toBitmap() };
};

function saveDiff(name, actualFile, diff, { width, height }) {
  fs.mkdirSync(FAILURES, { recursive: true });
  fs.copyFileSync(actualFile, path.join(FAILURES, `${name}.actual.png`));
  if (diff)
    fs.writeFileSync(
      path.join(FAILURES, `${name}.diff.png`),
      nativeImage.createFromBitmap(diff, { width, height }).toPNG(),
    );
}

app.whenReady().then(() => {
  const selected = CASES.filter((c) => only.length === 0 || only.includes(c.name));
  if (selected.length === 0) {
    console.log(`No such case. Cases: ${CASES.map((c) => c.name).join(', ')}`);
    return app.exit(2);
  }
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitgotchi-visual-'));
  fs.rmSync(FAILURES, { recursive: true, force: true });
  fs.mkdirSync(BASELINES, { recursive: true });

  const failed = [];
  for (const testCase of selected) {
    const { name } = testCase;
    const baselineFile = path.join(BASELINES, `${name}.png`);
    const result = render(testCase, outDir);
    if (result.error) {
      failed.push(name);
      console.log(`FAIL ${name}: could not render (${result.error})`);
      continue;
    }
    if (result.overflow) {
      failed.push(name);
      console.log(`FAIL ${name}: content overflows its card (${result.overflow})`);
      continue;
    }
    if (update) {
      fs.copyFileSync(result.file, baselineFile);
      console.log(`UPDATED ${name}`);
      continue;
    }
    if (!fs.existsSync(baselineFile)) {
      failed.push(name);
      console.log(`FAIL ${name}: no reference image yet (npm run shots:update)`);
      continue;
    }
    const actual = bitmapOf(result.file);
    const compared = compareBitmaps(bitmapOf(baselineFile), actual);
    if (compared.same) {
      console.log(`ok   ${name}${compared.differing ? ` (${compared.differing} px of noise)` : ''}`);
      continue;
    }
    failed.push(name);
    saveDiff(name, result.file, compared.diff, actual);
    const why = compared.sizeMismatch
      ? 'the window changed size'
      : `${compared.differing} px differ (${(compared.ratio * 100).toFixed(2)}%, up to ${MAX_DIFFERENT_RATIO * 100}% is allowed)`;
    console.log(`FAIL ${name}: ${why}`);
  }
  fs.rmSync(outDir, { recursive: true, force: true });

  if (failed.length) {
    console.log(
      `\n${failed.length} of ${selected.length} failed. Actual and diff images: ${path.relative(ROOT, FAILURES)}/`,
    );
    console.log('If the change is on purpose: npm run shots:update, and check the new images before committing them.');
  } else {
    console.log(`\n${update ? 'Updated' : 'All'} ${selected.length}${update ? '' : ' match'}.`);
  }
  app.exit(failed.length ? 1 : 0);
});
