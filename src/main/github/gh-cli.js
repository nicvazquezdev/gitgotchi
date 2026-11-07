// Reads the GitHub token from the `gh` CLI (the same login you use in the terminal).
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const { GITHUB } = require('../config');

class GhError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** `GITGOTCHI_GH_PATH` overrides the binary (custom installs, or `/usr/bin/false` to simulate a logout). */
function findGh() {
  return process.env.GITGOTCHI_GH_PATH || GITHUB.GH_PATHS.find((p) => fs.existsSync(p)) || 'gh';
}

function token() {
  return new Promise((resolve, reject) => {
    execFile(findGh(), ['auth', 'token'], { timeout: 10_000 }, (err, stdout) => {
      if (err?.code === 'ENOENT') return reject(new GhError('GitHub CLI (gh) not found.', 'GH_NOT_FOUND'));
      const value = stdout?.trim();
      if (err || !value) return reject(new GhError('gh is not logged in.', 'GH_NOT_LOGGED_IN'));
      resolve(value);
    });
  });
}

module.exports = { token };
