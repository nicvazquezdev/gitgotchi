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

  isEnabled() {
    return Boolean(store.get().cloudSync);
  }

  status() {
    return { enabled: this.isEnabled(), error: this.#error, lastPushAt: this.#lastPushAt || null };
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
      () => this.#setError(null),
      (err) => {
        console.error('[cloud]', err);
        this.#setError(err.message);
      },
    );
    return this.#queue;
  }

  #setError(message) {
    if (this.#error === message) return;
    this.#error = message;
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
    const { gh, owner } = await this.#target();
    if (!(await gh.repoExists(owner, SAVE.repo))) await gh.createPrivateRepo(SAVE.repo, SAVE.description);
  }

  async #pull() {
    const file = await this.#read();
    if (!file) return;
    store.update((state) => mergeSave(state, file.json));
    this.#lastSaved = JSON.stringify(file.json);
    this.emit('pulled');
  }

  async #push(retry = true) {
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
    this.#lastPushAt = Date.now();
  }
}

module.exports = new CloudSync();
