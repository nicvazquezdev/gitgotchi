// Orchestrates the pet: setup, GitHub sync and derived status.
// XP comes from the user's PRs (GraphQL) and reviews (Events API) in the selected repos, see game/catalog.js.
// Events: 'status' (status), 'evolved' (stage), 'levelUp' (new level; also fires on the level that evolves),
// 'activity' (new activity per kind, e.g. { merges: 1 }; pushes are animation only),
// 'configured' (setup saved: repos may have changed).
const { EventEmitter } = require('node:events');
const store = require('../store');
const session = require('./session');
const engine = require('../game/engine');
const { SPECIES } = require('../game/catalog');
const { fromDay } = require('../dates');
const { SYNC_INTERVAL_MS, LIVE } = require('../config');
const { addCredits, subtractCredits } = require('../live/credits');

class PetService extends EventEmitter {
  #syncing = null;
  #error = null;
  // Conditional-request state for the events feed (in memory: the first sync after launch is always full).
  #poll = { etag: null, interval: null };
  // Reactions only after a baseline sync in this session, so old activity never triggers them.
  #baselined = false;
  // Live reactions the Events diff has not reported yet (see live/credits.js).
  #credits = [];

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
        .slice(0, 16) || speciesInfo.stages[0].name;

    store.update({
      repos,
      pet: isNewPet
        ? { species, name: cleanName, bornAt: new Date().toISOString(), stageIndex: null }
        : { ...prev, name: cleanName },
      // New repos or a new pet: history is rebuilt from scratch.
      ...((isNewPet || reposChanged) && { activity: engine.emptyActivity() }),
    });
    if (isNewPet || reposChanged) this.#resetBaseline();
    this.notify();
    this.emit('configured');
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

  /** Reaction from a live source (local push, PR watcher). The later Events diff will not repeat it. */
  react(delta) {
    if (!this.isConfigured()) return;
    this.#credits = addCredits(this.#credits, delta, Date.now(), LIVE.CREDIT_TTL_MS);
    this.emit('activity', delta);
  }

  #resetBaseline() {
    this.#credits = [];
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
      const { since, backfill } = engine.prSyncStart(state);
      const [events, prs] = await Promise.all([
        gh.activity(state.user.login, from, this.#poll), // reviews; null = 304, nothing new
        gh.pullRequestsSince(since, { backfill }),
      ]);
      this.#error = null;
      const at = new Date().toISOString();
      const { delta } = this.#absorb({ events: events ?? [], prs }, { lastSyncedAt: at, prsSyncedAt: at });
      if (this.#baselined && Object.keys(delta).length > 0) this.emit('activity', delta);
      this.#baselined = true;
      this.#checkProgress();
    } catch (err) {
      console.error('[sync]', err);
      this.#poll.etag = null; // a failed sync must not hide events behind a 304
      this.#error = err.message;
    }
  }

  /** Fresh PR list from the live PR watcher (~10 s): keeps PR data and XP current between syncs. */
  applyPullRequests(prs) {
    // Only after the first sync: the backfill and the reaction baseline come from there.
    if (!this.isConfigured() || !this.#baselined || !store.get().activity.prsSyncedAt) return;
    const { delta, changed } = this.#absorb({ prs });
    if (!changed) return;
    if (Object.keys(delta).length > 0) this.emit('activity', delta);
    this.#checkProgress();
    this.notify();
  }

  /**
   * Stores fresh data in the ledger. Returns the activity it added that no live source celebrated
   * yet (`delta`, see live/credits.js) and whether the stored activity changed.
   */
  #absorb({ events, prs }, marks = {}) {
    const { activity: before, repos } = store.get();
    const activity = { ...engine.applyActivity(before, { events, prs, repos }), ...marks };
    const changed = JSON.stringify(activity) !== JSON.stringify(before);
    if (changed) store.update({ activity });
    const { delta, credits } = subtractCredits(
      this.#credits,
      engine.diffDays(before.days, activity.days),
      Date.now(),
      LIVE.CREDIT_TTL_MS,
    );
    this.#credits = credits;
    return { delta, changed };
  }

  /** Stores the level and stage reached (they never go down) and announces growth. */
  #checkProgress() {
    const { stage, level } = this.status();
    const { pet } = store.get();
    if (pet.stageIndex === stage.index && pet.level === level) return;
    store.update((s) => ({ pet: { ...s.pet, stageIndex: stage.index, level } }));
    // First time we only record where the pet is, no celebration.
    if (pet.level != null && level > pet.level) this.emit('levelUp', level);
    if (pet.stageIndex != null && stage.index > pet.stageIndex) this.emit('evolved', stage);
  }
}

module.exports = new PetService();
