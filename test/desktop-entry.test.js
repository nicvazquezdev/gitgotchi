const { test } = require('node:test');
const assert = require('node:assert/strict');
const { autostartEntry } = require('../src/main/desktop-entry');

test('is a hidden-terminal application entry with the name and the command', () => {
  const entry = autostartEntry({ name: 'Gitgotchi', args: ['/opt/gitgotchi/gitgotchi'] });
  assert.match(entry, /^\[Desktop Entry\]\nType=Application\nName=Gitgotchi\nExec=\/opt\/gitgotchi\/gitgotchi\n/);
  assert.match(entry, /Terminal=false/);
  assert.match(entry, /X-GNOME-Autostart-enabled=true/);
});

test('joins the arguments in order and quotes only those with reserved characters', () => {
  const entry = autostartEntry({ name: 'x', args: ['/bin/electron', '/home/me/my projects/gitgotchi'] });
  assert.match(entry, /Exec=\/bin\/electron "\/home\/me\/my projects\/gitgotchi"\n/);
});

test('escapes quotes, dollar signs, backticks, backslashes and percent signs inside quotes', () => {
  const entry = autostartEntry({ name: 'x', args: ['/a "b" $c `d` 100%'] });
  assert.match(entry, /Exec="\/a \\"b\\" \\\$c \\`d\\` 100%%"\n/);
  assert.match(autostartEntry({ name: 'x', args: ['/a\\b'] }), /Exec="\/a\\\\\\\\b"\n/);
});
