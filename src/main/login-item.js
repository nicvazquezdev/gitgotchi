// "Open at login". On macOS we use a LaunchAgent instead of app.setLoginItemSettings:
// in development the latter registers the bare Electron binary, which would open without our app.
const { app } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IS_MAC } = require('./config');
const { launchAgentPlist } = require('./launch-agent');

const LABEL = 'com.gitgotchi.app';
const plistPath = () => path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);

// Packaged: the app binary. Development: the Electron binary plus the project folder.
const launchArgs = () => (app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()]);

function isEnabled() {
  return IS_MAC ? fs.existsSync(plistPath()) : app.getLoginItemSettings().openAtLogin;
}

function setEnabled(enabled) {
  if (!IS_MAC) return app.setLoginItemSettings({ openAtLogin: enabled });
  if (!enabled) return fs.rmSync(plistPath(), { force: true });
  fs.mkdirSync(path.dirname(plistPath()), { recursive: true });
  fs.writeFileSync(plistPath(), launchAgentPlist({ label: LABEL, args: launchArgs() }));
}

module.exports = { isEnabled, setEnabled };
