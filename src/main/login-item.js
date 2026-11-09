// "Open at login". macOS and Linux start the app from a file of their own: a LaunchAgent on macOS, an autostart entry
// on Linux. In development app.setLoginItemSettings would register the bare Electron binary, which would open without
// our app, and on Linux Electron does not support it at all. Windows uses it (with the path and arguments we want).
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IS_MAC, IS_LINUX, APP_ID } = require('./config');
const { launchAgentPlist } = require('./launch-agent');
const { autostartEntry } = require('./desktop-entry');
const store = require('./store');

const plistPath = () => path.join(os.homedir(), 'Library/LaunchAgents', `${APP_ID}.plist`);
const autostartPath = () =>
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'gitgotchi.desktop');

// Packaged: the app binary (an AppImage is the file itself: the binary inside it only exists while it runs).
// Development: the Electron binary plus the project folder.
const launchArgs = () =>
  app.isPackaged ? [process.env.APPIMAGE || process.execPath] : [process.execPath, app.getAppPath()];

/** The file that starts the app at login, and what goes in it. */
const loginFile = () =>
  IS_MAC
    ? { file: plistPath(), text: () => launchAgentPlist({ label: APP_ID, args: launchArgs() }) }
    : { file: autostartPath(), text: () => autostartEntry({ name: 'Gitgotchi', args: launchArgs() }) };

function isEnabled() {
  if (IS_MAC || IS_LINUX) return fs.existsSync(loginFile().file);
  const [execPath, ...args] = launchArgs();
  return app.getLoginItemSettings({ path: execPath, args }).openAtLogin;
}

function setEnabled(enabled) {
  if (!IS_MAC && !IS_LINUX) {
    const [execPath, ...args] = launchArgs();
    return app.setLoginItemSettings({ openAtLogin: enabled, path: execPath, args });
  }
  const { file, text } = loginFile();
  if (!enabled) return fs.rmSync(file, { force: true });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text());
}

/** "Open at login" is on by default: enable it once, the first time the app runs. */
function applyDefault() {
  if (store.get().openAtLoginDefaulted) return;
  setEnabled(true);
  store.update({ openAtLoginDefaulted: true });
}

module.exports = { isEnabled, setEnabled, applyDefault };
