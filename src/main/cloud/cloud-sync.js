// Optional cloud save: keeps the pet in a private repo in the user's own GitHub account,
// so it follows them to any computer where they're logged in with `gh`. Off by default.
//
// Writes are rare on purpose (each one is a commit, and pushes show up in the user's events):
// only when something changed, at most once per CLOUD.PUSH_INTERVAL_MS, right away after a
// settings change, and once when the app quits. Reads happen at startup and every CLOUD.PULL_INTERVAL_MS.
const { EventEmitter } = require('node:events');
const store = require('../store');
const session = require('../services/session');
const { CLOUD } = require('../config');
const { SAVE, toSave, isSave, mergeSave, saveSummary } = require('./save');

class CloudSync extends EventEmitter {
  #sha = null; // blob sha of save.json, needed to replace it
  #lastSaved = null; // JSON of the last save written or read
  #lastPushAt = 0;
  #timer = null;
  #queue = Promise.resolve(); // one GitHub write/read at a time
  #error = null;
  #phase = null; // what the current job is doing, for the Settings window (see `status().phase`)

  isEnabled() {
    return Boolean(store.get().cloudSync);
  }

  /**
   * `repo`: where the save lives ("<login>/gitgotchi-save"); `lastPushAt`: last write in this session;
   * `saved`: a save exists in the repo (it stays there after the backup is turned off);
   * `phase`: null when idle, else 'checking' (is there a repo?), 'creating' (the repo),
   * 'pulling' (the remote save) or 'saving' (writing the save).
   */
  status() {
    const login = store.get().user?.login;
    return {
      enabled: this.isEnabled(),
      repo: login ? `${login}/${SAVE.repo}` : null,
      saved: Boolean(store.get().cloudSaved),
      phase: this.#phase,
      error: this.#error,
      lastPushAt: this.#lastPushAt || null,
    };
  }

  /** Onboarding: is there a saved pet in this account? → `{ found, pet? }` */
  async find() {
    const file = await this.#read();
    return file ? { found: true, pet: saveSummary(file.json) } : { found: false };
  }

  /** Onboarding: adopt the saved pet on this computer and keep syncing it. */
  restore() {
    return this.#run(async () => {
      store.update({ cloudSync: true });
      await this.#pull();
    });
  }

  enable() {
    store.update({ cloudSync: true });
    this.#setPhase('checking'); // right away: the queue may be busy with another job
    return this.#run(async () => {
      await this.#ensureRepo();
      await this.#pull();
      await this.#push();
    });
  }

  disable() {
    clearTimeout(this.#timer);
    store.update({ cloudSync: false });
    this.#setError(null);
  }

  /** True while a job is running: the switch must not be flipped halfway. */
  isBusy() {
    return this.#phase !== null;
  }

  /** Merges the remote save into this computer. */
  pull() {
    return this.isEnabled() ? this.#run(() => this.#pull()) : Promise.resolve();
  }

  /** Call whenever local state may have changed; writes later (or `now`) only if the save differs. */
  schedulePush({ now = false } = {}) {
    if (!this.#hasChanges()) return;
    const wait = now ? 0 : Math.max(0, this.#lastPushAt + CLOUD.PUSH_INTERVAL_MS - Date.now());
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#run(() => this.#push()), wait);
  }

  /** Writes pending changes right away (used when quitting). */
  flush() {
    clearTimeout(this.#timer);
    return this.#hasChanges() ? this.#run(() => this.#push()) : Promise.resolve();
  }

  // ---------- internals ----------

  #hasChanges() {
    const state = store.get();
    return this.isEnabled() && Boolean(state.pet) && JSON.stringify(toSave(state)) !== this.#lastSaved;
  }

  /** Serializes GitHub calls and turns failures into a visible error instead of throwing. */
  #run(task) {
    this.#queue = this.#queue.then(task).then(
      () => this.#finish(null),
      (err) => {
        console.error('[cloud]', err);
        this.#finish(err.message);
      },
    );
    return this.#queue;
  }

  /** Ends a job: back to idle, with the error if it failed. One status event for both changes. */
  #finish(error) {
    const changed = this.#phase !== null || this.#error !== error;
    this.#phase = null;
    this.#error = error;
    if (changed) this.emit('status', this.status());
  }

  #setError(message) {
    if (this.#error === message) return;
    this.#error = message;
    this.emit('status', this.status());
  }

  #setPhase(phase) {
    if (this.#phase === phase) return;
    this.#phase = phase;
    this.emit('status', this.status());
  }

  async #target() {
    return { gh: await session.client(), owner: store.get().user.login };
  }

  async #read() {
    const { gh, owner } = await this.#target();
    const file = await gh.readJsonFile(owner, SAVE.repo, SAVE.path);
    if (!file) return null;
    if (!isSave(file.json)) throw new Error(`${owner}/${SAVE.repo} exists but isn't a Gitgotchi save`);
    this.#sha = file.sha;
    return file;
  }

  async #ensureRepo() {
    this.#setPhase('checking');
    const { gh, owner } = await this.#target();
    if (await gh.repoExists(owner, SAVE.repo)) return;
    this.#setPhase('creating');
    await gh.createPrivateRepo(SAVE.repo, SAVE.description);
  }

  async #pull() {
    this.#setPhase('pulling');
    const file = await this.#read();
    if (!file) return;
    store.update((state) => ({ ...mergeSave(state, file.json), cloudSaved: true }));
    this.#lastSaved = JSON.stringify(file.json);
    this.emit('pulled');
  }

  async #push(retry = true) {
    this.#setPhase('saving');
    const { gh, owner } = await this.#target();
    const json = toSave(store.get());
    try {
      this.#sha = await gh.writeJsonFile(owner, SAVE.repo, SAVE.path, {
        json,
        sha: this.#sha,
        message: 'Update Gitgotchi save',
        identity: SAVE.identity,
      });
    } catch (err) {
      // 404: the repo is gone; 409/422: the file changed elsewhere (or we had no sha). Sync and retry once.
      if (!retry || ![404, 409, 422].includes(err.status)) throw err;
      if (err.status === 404) await this.#ensureRepo();
      else await this.#pull();
      return this.#push(false);
    }
    this.#lastSaved = JSON.stringify(json);
    this.#lastPushAt = Date.now(); // the status event comes from #finish
    store.update({ cloudSaved: true });
  }
}

module.exports = new CloudSync();
