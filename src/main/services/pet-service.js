// Orchestrates the pet: setup, GitHub sync and derived status.
// Events: 'status' (status), 'evolved' (stage).
const { EventEmitter } = require('node:events');
const store = require('../store');
const session = require('./session');
const engine = require('../game/engine');
const { SPECIES } = require('../game/catalog');
const { fromDay } = require('../dates');

class PetService extends EventEmitter {
  #syncing = null;
  #error = null;

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
    this.notify();
    this.sync();
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
      const events = await gh.activity(state.user.login, from);
      const days = engine.buildDays({ events, repos: state.repos });
      store.update((s) => ({
        activity: { days: engine.mergeDays(s.activity.days, days), lastSyncedAt: new Date().toISOString() },
      }));
      this.#error = null;
      this.#checkEvolution();
    } catch (err) {
      console.error('[sync]', err);
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
