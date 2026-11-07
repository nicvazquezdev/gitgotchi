// Opening links in the browser: only github.com pages, never anything a page could make up.
const { shell } = require('electron');

/** True for https://github.com URLs (and nothing else). */
function isGithubUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'github.com';
  } catch {
    return false;
  }
}

function openGithub(url) {
  if (isGithubUrl(url)) shell.openExternal(url);
}

module.exports = { isGithubUrl, openGithub };
