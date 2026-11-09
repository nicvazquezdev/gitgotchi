const { test } = require('node:test');
const assert = require('node:assert/strict');
const { trayMenuTemplate } = require('../src/main/ui/tray-menu');

const actions = Object.fromEntries(
  ['resume', 'startVacation', 'togglePet', 'openCard', 'openSettings', 'quit'].map((name) => [name, () => name]),
);
const labels = (template) => template.filter((item) => item.label).map((item) => item.label);
const state = { configured: true, petVisible: true, status: { pause: { active: false } } };

test('has the same rows as the menu page', () => {
  assert.deepEqual(labels(trayMenuTemplate(state, actions)), [
    'Vacation…',
    'Hide pet',
    'Pet card',
    'Settings…',
    'Quit Gitgotchi',
  ]);
});

test('offers the way back during a vacation and shows the pet when it is hidden', () => {
  const template = trayMenuTemplate({ ...state, petVisible: false, status: { pause: { active: true } } }, actions);
  assert.deepEqual(labels(template).slice(0, 2), ["I'm back", 'Show pet']);
  assert.equal(template[0].click(), 'resume');
});

test('before the first setup it only offers the setup and quit', () => {
  const template = trayMenuTemplate({ configured: false, petVisible: false, status: null }, actions);
  assert.deepEqual(labels(template), ['Set up Gitgotchi…', 'Quit Gitgotchi']);
  assert.equal(template.at(-1).click(), 'quit');
});

test('has a row for the update only when there is news', () => {
  const withUpdate = { ...state, update: { menuLabel: 'Update to 0.2.0…' } };
  const template = trayMenuTemplate(withUpdate, { ...actions, applyUpdate: () => 'applyUpdate' });
  assert.deepEqual(labels(template), [
    'Vacation…',
    'Hide pet',
    'Pet card',
    'Settings…',
    'Update to 0.2.0…',
    'Quit Gitgotchi',
  ]);
  assert.equal(template.find((item) => item.label === 'Update to 0.2.0…').click(), 'applyUpdate');
  assert.equal(labels(trayMenuTemplate({ ...state, update: { menuLabel: null } }, actions)).length, 5);
});
