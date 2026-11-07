const test = require('node:test');
const assert = require('node:assert/strict');
const { isGithubUrl } = require('../src/main/ui/external-links');

test('isGithubUrl only accepts https://github.com pages', () => {
  assert.equal(isGithubUrl('https://github.com/acme/app/pull/12'), true);
  assert.equal(isGithubUrl('http://github.com/acme/app'), false);
  assert.equal(isGithubUrl('https://github.com.evil.example/acme'), false);
  assert.equal(isGithubUrl('https://evil.example/github.com'), false);
  assert.equal(isGithubUrl('file:///etc/passwd'), false);
  assert.equal(isGithubUrl('javascript:alert(1)'), false);
  assert.equal(isGithubUrl(undefined), false);
});
