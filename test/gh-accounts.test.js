const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAccounts, pickAccount } = require('../src/main/github/gh-cli');

const entry = (login, extra = {}) => ({ state: 'success', active: false, host: 'github.com', login, ...extra });
const status = (hosts) => JSON.stringify({ hosts });

test('parseAccounts: no hosts, empty or invalid output gives no accounts', () => {
  assert.deepEqual(parseAccounts(status({})), []);
  assert.deepEqual(parseAccounts(status({ 'github.com': [] })), []);
  assert.deepEqual(parseAccounts(''), []);
  assert.deepEqual(parseAccounts('not json'), []);
  assert.deepEqual(parseAccounts('null'), []);
  assert.deepEqual(parseAccounts(status({ 'github.com': 'oops' })), []);
});

test('parseAccounts: one account', () => {
  const json = status({ 'github.com': [entry('nic', { active: true, scopes: 'repo', tokenSource: 'keyring' })] });
  assert.deepEqual(parseAccounts(json), [{ login: 'nic', active: true }]);
});

test('parseAccounts: several accounts keep order and the active flag', () => {
  const json = status({ 'github.com': [entry('work'), entry('nic', { active: true }), entry('oss')] });
  assert.deepEqual(parseAccounts(json), [
    { login: 'work', active: false },
    { login: 'nic', active: true },
    { login: 'oss', active: false },
  ]);
});

test('parseAccounts: ignores other hosts', () => {
  const json = status({
    'github.com': [entry('nic', { active: true })],
    'ghe.example.com': [entry('corp', { active: true, host: 'ghe.example.com' })],
  });
  assert.deepEqual(parseAccounts(json), [{ login: 'nic', active: true }]);
  assert.deepEqual(parseAccounts(json, 'ghe.example.com'), [{ login: 'corp', active: true }]);
  assert.deepEqual(parseAccounts(status({ 'ghe.example.com': [entry('corp')] })), []);
});

test('parseAccounts: skips failed accounts and malformed entries', () => {
  const json = status({
    'github.com': [entry('broken', { state: 'error', active: true }), entry('ok'), { state: 'success' }, null],
  });
  assert.deepEqual(parseAccounts(json), [{ login: 'ok', active: false }]);
});

test('pickAccount: prefers the stored login, then the gh-active one, then the first', () => {
  const accounts = [
    { login: 'a', active: false },
    { login: 'b', active: true },
    { login: 'c', active: false },
  ];
  assert.equal(pickAccount(accounts, 'c').login, 'c');
  assert.equal(pickAccount(accounts, 'gone').login, 'b');
  assert.equal(pickAccount(accounts, undefined).login, 'b');
  const noneActive = accounts.map((a) => ({ ...a, active: false }));
  assert.equal(pickAccount(noneActive, null).login, 'a');
});

test('pickAccount: no accounts gives null', () => {
  assert.equal(pickAccount([], 'a'), null);
});
