const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trayLabel } = require('../src/main/ui/tray-label');

test('the menu bar shows how many PRs wait for the user, and nothing at zero', () => {
  assert.deepEqual(trayLabel(3, true), { title: '3', tooltip: 'Gitgotchi: 3 PRs need your review' });
  assert.deepEqual(trayLabel(1, true), { title: '1', tooltip: 'Gitgotchi: 1 PR needs your review' });
  assert.deepEqual(trayLabel(0, true), { title: '', tooltip: 'Gitgotchi' });
});

test('the setting turns it off, and bad numbers show nothing', () => {
  assert.deepEqual(trayLabel(5, false), { title: '', tooltip: 'Gitgotchi' });
  for (const bad of [undefined, NaN, -2, null]) assert.equal(trayLabel(bad, true).title, '');
});

test('a very long queue does not widen the menu bar', () => {
  assert.equal(trayLabel(99, true).title, '99');
  assert.equal(trayLabel(100, true).title, '99+');
  assert.equal(trayLabel(100, true).tooltip, 'Gitgotchi: 100 PRs need your review');
});
