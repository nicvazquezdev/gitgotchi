// Local state in `state.json` (app data folder): settings and pet progress.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_PET_SIZE } = require('./config');

const file = () => path.join(app.getPath('userData'), 'state.json');

const defaults = () => ({
  user: null, // { login, name, avatarUrl }
  repos: [], // ['owner/name']
  pet: null, // { species, name, bornAt, stageIndex }
  activity: { days: {}, lastSyncedAt: null },
  position: null, // { x, y } of the pet window
  petSize: DEFAULT_PET_SIZE, // sprite size in px
});

let state = null;

function get() {
  if (!state) {
    try {
      state = { ...defaults(), ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
    } catch {
      state = defaults();
    }
  }
  return state;
}

/** Applies a patch (object or state => patch function) and saves atomically. */
function update(patch) {
  const current = get();
  state = { ...current, ...(typeof patch === 'function' ? patch(current) : patch) };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(`${file()}.tmp`, JSON.stringify(state, null, 2));
  fs.renameSync(`${file()}.tmp`, file());
  return state;
}

/** Clears everything except the pet's screen position and size. */
function reset() {
  const { position, petSize } = get();
  update({ ...defaults(), position, petSize });
}

module.exports = { get, update, reset };
