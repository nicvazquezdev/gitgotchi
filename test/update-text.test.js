const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const text = () => import(path.join(__dirname, '../src/renderer/shared/update-text.js'));
const base = { supported: true, status: 'idle', latest: null, progress: 0, error: null };

test('a development build says it does not look for updates, and offers nothing', async () => {
  const { updateRow } = await text();
  const row = updateRow({ ...base, supported: false });
  assert.match(row.hint, /development build/i);
  assert.equal(row.action, undefined);
});

test('up to date offers a check; a failed check offers to try again', async () => {
  const { updateRow } = await text();
  assert.deepEqual(updateRow(base).action, { label: 'Check now', name: 'checkForUpdates' });
  const failed = updateRow({ ...base, error: 'offline' });
  assert.equal(failed.error, true);
  assert.deepEqual(failed.action, { label: 'Try again', name: 'checkForUpdates' });
});

test('checking and downloading are busy and offer nothing', async () => {
  const { updateRow } = await text();
  assert.deepEqual(
    [updateRow({ ...base, status: 'checking' }).busy, updateRow({ ...base, status: 'checking' }).action],
    [true, undefined],
  );
  const downloading = updateRow({ ...base, status: 'downloading', latest: '0.2.0', progress: 42 });
  assert.equal(downloading.hint, 'Downloading 0.2.0… 42%');
  assert.equal(downloading.busy, true);
});

test('a version that is out, or ready, offers the one action', async () => {
  const { updateRow } = await text();
  assert.deepEqual(updateRow({ ...base, status: 'available', latest: '0.2.0' }).action, {
    label: 'Get it',
    name: 'applyUpdate',
  });
  assert.deepEqual(updateRow({ ...base, status: 'ready', latest: '0.2.0' }).action, {
    label: 'Restart to update',
    name: 'applyUpdate',
  });
});
