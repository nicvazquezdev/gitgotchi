const { test } = require('node:test');
const assert = require('node:assert/strict');
const { launchAgentPlist } = require('../src/main/launch-agent');

test('includes label, every argument in order, and RunAtLoad', () => {
  const xml = launchAgentPlist({ label: 'com.example.app', args: ['/bin/app', '/projects/my app'] });
  assert.match(xml, /<string>com\.example\.app<\/string>/);
  assert.ok(xml.indexOf('/bin/app') < xml.indexOf('/projects/my app'));
  assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
});

test('escapes XML special characters in arguments', () => {
  const xml = launchAgentPlist({ label: 'x', args: ['/a & b/<c>'] });
  assert.match(xml, /<string>\/a &amp; b\/&lt;c&gt;<\/string>/);
});
