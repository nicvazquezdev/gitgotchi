const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// The notifier talks to macOS through Electron's Notification: replace it to see what would be shown.
const shown = [];
let supported = true;
class FakeNotification {
  static isSupported() {
    return supported;
  }
  constructor(options) {
    this.options = options;
    this.handlers = {};
  }
  on(event, handler) {
    this.handlers[event] = handler;
  }
  show() {
    shown.push(this);
  }
}
const electronPath = require.resolve('electron');
require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: { Notification: FakeNotification },
};
const { createNotifier } = require(path.join(__dirname, '../src/main/ui/notifier.js'));
const { COOLDOWN_MS } = require('../src/main/notify-plan');

const item = (kind, n, extra = {}) => ({
  kind,
  id: `pr${n}`,
  title: `Title ${n}`,
  repo: 'acme/web-app',
  number: n,
  url: `https://github.com/acme/web-app/pull/${n}`,
  author: 'ana',
  via: null,
  ...extra,
});

describe('createNotifier', () => {
  let enabled;
  let opened;
  let notifier;

  beforeEach(() => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    shown.length = 0;
    supported = true;
    enabled = true;
    opened = [];
    notifier = createNotifier({
      isEnabled: () => enabled,
      openPullRequest: (url) => opened.push(['pr', url]),
      openPopover: () => opened.push(['popover']),
    });
  });
  afterEach(() => mock.timers.reset());

  test('shows what arrived after a short wait, and clicking a single one opens its PR', () => {
    notifier.notify([item('reviewRequested', 1)]);
    assert.equal(shown.length, 0, 'it waits a moment for more');
    mock.timers.tick(2000);
    assert.equal(shown.length, 1);
    assert.deepEqual(shown[0].options, {
      title: 'Review requested',
      subtitle: 'web-app #1 · ana',
      body: 'Title 1',
      silent: false,
    });
    shown[0].handlers.click();
    assert.deepEqual(opened, [['pr', 'https://github.com/acme/web-app/pull/1']]);
  });

  test('things that arrive together are one notification, and clicking it opens the popover', () => {
    notifier.notify([item('reviewRequested', 1)]);
    mock.timers.tick(500);
    notifier.notify([item('reviewRequested', 2), item('reviewRequested', 3)]);
    mock.timers.tick(1500);
    assert.equal(shown.length, 1);
    assert.equal(shown[0].options.title, '3 review requests');
    shown[0].handlers.click();
    assert.deepEqual(opened, [['popover']]);
  });

  test('nothing is shown when the user turned notifications off or is in Do not disturb', () => {
    enabled = false;
    notifier.notify([item('checksFailed', 1)]);
    mock.timers.tick(5000);
    assert.equal(shown.length, 0);
  });

  test('turning them off while the batch waits drops it', () => {
    notifier.notify([item('checksFailed', 1)]);
    enabled = false;
    mock.timers.tick(2000);
    assert.equal(shown.length, 0);
    enabled = true;
    mock.timers.tick(5000);
    assert.equal(shown.length, 0, 'and it does not come back later');
  });

  test('the same PR is not announced twice for the same thing within half an hour', () => {
    notifier.notify([item('checksFailed', 1)]);
    mock.timers.tick(2000);
    notifier.notify([item('checksFailed', 1)]);
    mock.timers.tick(2000);
    assert.equal(shown.length, 1);
    mock.timers.tick(COOLDOWN_MS);
    notifier.notify([item('checksFailed', 1)]);
    mock.timers.tick(2000);
    assert.equal(shown.length, 2);
  });

  test('where the system has no notifications, it does nothing', () => {
    supported = false;
    notifier.notify([item('readyToMerge', 1)]);
    mock.timers.tick(5000);
    assert.equal(shown.length, 0);
  });

  test('good news is silent, problems are not', () => {
    notifier.notify([item('readyToMerge', 1), item('changesRequested', 2)]);
    mock.timers.tick(2000);
    const silent = Object.fromEntries(shown.map((n) => [n.options.title, n.options.silent]));
    assert.deepEqual(silent, { 'Changes requested': false, 'Ready to merge': true });
  });
});
