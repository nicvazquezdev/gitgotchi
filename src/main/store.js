// Local state in `state.json` (app data folder): settings and pet progress.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_PET_SIZE } = require('./config');
const { SCHEMA, migrate } = require('./migrations');

const file = () => path.join(app.getPath('userData'), 'state.json');

const defaults = () => ({
  schema: SCHEMA,
  user: null, // { login, name, avatarUrl }
  repos: [], // ['owner/name']
  pet: null, // { species, name, bornAt, stageIndex }
  activity: { days: {}, lastSyncedAt: null },
  position: null, // { x, y } of the pet window
  petSize: DEFAULT_PET_SIZE, // pet box size in px (the sprite canvas, see PET_BOX)
  speechBubbles: true, // device setting: show the pet's speech bubbles
  doNotDisturb: false, // device setting: no bubbles, notifications or evolution popups
  openAtLoginDefaulted: false, // true once "Open at login" got its default (on), so a later opt-out sticks
  cloudSync: false, // optional cloud save in the user's GitHub account (device setting)
  cloudSaved: false, // a save exists in the user's GitHub account (written or found by this app)
  profileUpdatedAt: null, // when the pet or repos last changed here (cloud save: last change wins)
});

let state = null;

function get() {
  if (!state) {
    try {
      state = { ...defaults(), ...migrate(JSON.parse(fs.readFileSync(file(), 'utf8'))) };
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

/** Clears everything except the device settings (pet position and size, menu toggles). */
function reset() {
  const { position, petSize, speechBubbles, doNotDisturb, openAtLoginDefaulted } = get();
  update({ ...defaults(), position, petSize, speechBubbles, doNotDisturb, openAtLoginDefaulted });
}

module.exports = { get, update, reset };
