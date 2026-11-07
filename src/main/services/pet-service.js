// Orchestrates the pet: setup, GitHub sync and derived status.
// Events: 'status' (status), 'evolved' (stage), 'activity' (new activity per kind, e.g. { merges: 1 }).
const { EventEmitter } = require('node:events');
const store = require('../store');
const session = require('./session');
const engine = require('../game/engine');
const { SPECIES } = require('../game/catalog');
const { fromDay } = require('../dates');
const { SYNC_INTERVAL_MS } = require('../config');

class PetService extends EventEmitter {
  #syncing = null;
  #error = null;
  // Conditional-request state for the events feed (in memory: the first sync after launch is always full).
  #poll = { etag: null, interval: null };
  // Reactions only after a baseline sync in this session, so old activity never triggers them.
  #baselined = false;

  isConfigured() {
    const { pet, repos } = store.get();
    return session.isConnected() && Boolean(pet) && repos.length > 0;
  }

  status() {
    const status = engine.computeStatus(store.get());
    return status && { ...status, syncing: Boolean(this.#syncing), error: this.#error };
  }

  notify() {
    this.emit('status', this.status());
  }

  async listRepos() {
    const gh = await session.client();
    const { login } = store.get().user;
    const [events, accessible] = await Promise.all([gh.activity(login), gh.accessibleRepos()]);
    return engine.rankRepos(events, accessible);
  }

  /** Saves the onboarding choice. Changing species hatches a new pet. */
  async configure({ repos, species, name }) {
    if (!Array.isArray(repos) || repos.length === 0) throw new Error('Pick at least one repo');
    const speciesInfo = SPECIES.find((s) => s.id === species);
    if (!speciesInfo) throw new Error('Unknown pet species');

    const { pet: prev, repos: prevRepos } = store.get();
    const isNewPet = prev?.species !== species;
    const reposChanged = [...repos].sort().join() !== [...prevRepos].sort().join();
    const cleanName =
      String(name ?? '')
        .trim()
        .slice(0, 16) || speciesInfo.name;

    store.update({
      repos,
      pet: isNewPet
        ? { species, name: cleanName, bornAt: new Date().toISOString(), stageIndex: null }
        : { ...prev, name: cleanName },
      // New repos or a new pet: history is rebuilt from scratch.
      ...((isNewPet || reposChanged) && { activity: { days: {}, lastSyncedAt: null } }),
    });
    if (isNewPet || reposChanged) this.#resetBaseline();
    this.notify();
    this.sync();
  }

  /** The one sync loop: syncs every SYNC_INTERVAL_MS, or GitHub's X-Poll-Interval if that is longer. */
  startPolling() {
    const loop = async () => {
      await this.sync();
      setTimeout(loop, Math.max(SYNC_INTERVAL_MS, (this.#poll.interval ?? 0) * 1000));
    };
    setTimeout(loop, SYNC_INTERVAL_MS);
  }

  #resetBaseline() {
    this.#poll.etag = null;
    this.#baselined = false;
  }

  /** Fetches new activity. Reuses the in-flight sync if there is one. */
  sync() {
    if (!this.isConfigured()) return Promise.resolve();
    this.#syncing ??= this.#doSync().finally(() => {
      this.#syncing = null;
      this.notify();
    });
    this.notify();
    return this.#syncing;
  }

  async #doSync() {
    const state = store.get();
    const from = fromDay(engine.syncStartDay(state));
    try {
      const gh = await session.client();
      const events = await gh.activity(state.user.login, from, this.#poll);
      this.#error = null;
      if (!events) return; // 304: nothing new
      const before = store.get().activity.days;
      const days = engine.mergeDays(before, engine.buildDays({ events, repos: state.repos }));
      store.update({ activity: { days, lastSyncedAt: new Date().toISOString() } });

      const delta = engine.diffDays(before, days);
      if (this.#baselined && Object.keys(delta).length > 0) this.emit('activity', delta);
      this.#baselined = true;
      this.#checkEvolution();
    } catch (err) {
      console.error('[sync]', err);
      this.#poll.etag = null; // a failed sync must not hide events behind a 304
      this.#error = err.message;
    }
  }

  #checkEvolution() {
    const { stage } = this.status();
    const { pet } = store.get();
    if (pet.stageIndex === stage.index) return;
    // First time we only record the stage, no celebration.
    if (pet.stageIndex != null && stage.index > pet.stageIndex) this.emit('evolved', stage);
    store.update((s) => ({ pet: { ...s.pet, stageIndex: stage.index } }));
  }
}

module.exports = new PetService();
