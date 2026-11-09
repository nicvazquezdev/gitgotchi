const { test } = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { createUpdater } = require('../src/main/services/updater');

/** electron-updater stand-in: an emitter that records what it is asked. */
function fakeAutoUpdater() {
  const fake = new EventEmitter();
  fake.checks = 0;
  fake.installs = [];
  fake.checkForUpdates = async () => {
    fake.checks++;
    fake.emit('checking-for-update');
  };
  fake.quitAndInstall = (...args) => fake.installs.push(args);
  return fake;
}

function setup({ canInstall = false, packaged = true } = {}) {
  const autoUpdater = fakeAutoUpdater();
  const opened = [];
  const updater = createUpdater({
    getAutoUpdater: () => autoUpdater,
    version: '0.1.0',
    packaged,
    canInstall,
    openReleases: () => opened.push('releases'),
    firstCheckMs: 1e9, // the timers never fire in a test
    checkEveryMs: 1e9,
  });
  updater.start();
  return { updater, autoUpdater, opened };
}

test('a development build is not supported and never asks', async () => {
  const { updater, autoUpdater } = setup({ packaged: false });
  await updater.check();
  assert.equal(autoUpdater.checks, 0);
  assert.equal(updater.state().supported, false);
  assert.equal(updater.state().menuLabel, null);
});

test('starts idle on the running version', () => {
  const { updater } = setup();
  assert.deepEqual(
    { version: updater.state().version, status: updater.state().status, latest: updater.state().latest },
    { version: '0.1.0', status: 'idle', latest: null },
  );
});

test('where it cannot install, a new version is only reported and apply opens its page', async () => {
  const { updater, autoUpdater, opened } = setup({ canInstall: false });
  assert.equal(autoUpdater.autoDownload, false);
  assert.equal(autoUpdater.autoInstallOnAppQuit, false);
  await updater.check();
  assert.equal(updater.state().status, 'checking');
  autoUpdater.emit('update-available', { version: '0.2.0' });
  assert.deepEqual([updater.state().status, updater.state().latest], ['available', '0.2.0']);
  assert.equal(updater.state().menuLabel, 'Update to 0.2.0…');
  updater.apply();
  assert.deepEqual(opened, ['releases']);
  assert.deepEqual(autoUpdater.installs, []);
});

test('where it can install, it downloads, then restarts into the new version', async () => {
  const { updater, autoUpdater, opened } = setup({ canInstall: true });
  assert.equal(autoUpdater.autoDownload, true);
  assert.equal(autoUpdater.autoInstallOnAppQuit, true);
  await updater.check();
  autoUpdater.emit('update-available', { version: '0.2.0' });
  assert.equal(updater.state().status, 'downloading');
  assert.equal(updater.state().menuLabel, null); // nothing to do yet
  autoUpdater.emit('download-progress', { percent: 41.6 });
  assert.equal(updater.state().progress, 42);
  updater.apply(); // still downloading: nothing happens
  assert.deepEqual(autoUpdater.installs, []);
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  assert.deepEqual([updater.state().status, updater.state().menuLabel], ['ready', 'Restart to update']);
  updater.apply();
  assert.deepEqual(autoUpdater.installs, [[true, true]]); // silent, and the app opens again
  assert.deepEqual(opened, []);
});

test('no new version goes back to idle and remembers when it looked', async () => {
  const { updater, autoUpdater } = setup();
  await updater.check();
  autoUpdater.emit('update-not-available', { version: '0.1.0' });
  assert.equal(updater.state().status, 'idle');
  assert.ok(updater.state().checkedAt > 0);
});

test('a failed check is kept as an error and cleared by the next check', async () => {
  const { updater, autoUpdater } = setup();
  await updater.check();
  autoUpdater.emit('error', new Error('offline'));
  assert.deepEqual([updater.state().status, updater.state().error], ['idle', 'offline']);
  await updater.check();
  assert.equal(updater.state().error, null);
});

test('a failed check does not hide a version that is already out', async () => {
  const { updater, autoUpdater } = setup({ canInstall: false });
  await updater.check();
  autoUpdater.emit('update-available', { version: '0.2.0' });
  await updater.check();
  autoUpdater.emit('error', new Error('offline'));
  assert.deepEqual([updater.state().status, updater.state().latest], ['available', '0.2.0']);
});

test('it does not ask again while a check or a download goes on, or after one is ready', async () => {
  const { updater, autoUpdater } = setup({ canInstall: true });
  await updater.check();
  await updater.check();
  assert.equal(autoUpdater.checks, 1);
  autoUpdater.emit('update-available', { version: '0.2.0' });
  await updater.check();
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  await updater.check();
  assert.equal(autoUpdater.checks, 1);
});

test('emits change with the new state', async () => {
  const { updater, autoUpdater } = setup();
  const seen = [];
  updater.on('change', (state) => seen.push(state.status));
  await updater.check();
  autoUpdater.emit('update-not-available', {});
  assert.deepEqual(seen, ['checking', 'idle']);
});
