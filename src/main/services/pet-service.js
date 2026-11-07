// Orchestrates the pet: setup, GitHub sync and derived status.
// XP comes from the user's PRs (GraphQL), reviews, issues and pushes (Events API; a push is worth its commits,
// found with one lookup each) in the selected repos, see game/catalog.js.
// Events: 'status' (status), 'evolved' (stage), 'levelUp' (new level; also fires on the level that evolves),
// 'achievements' (the ones just reached, as `[{ id, name, description, icon, tier, points }]`),
// 'activity' (new activity per kind, e.g. { merges: 1 }; a live `pushes` reaction is animation only;
// `reviewRequests` is not XP: someone asked the user for a review),
// 'attention' (what the user may want a system notification for: `[{ kind, id, title, repo, number, url, author, via }]`,
// kind: 'reviewRequested' | 'approved' | 'changesRequested' | 'checksFailed'),
// 'configured' (setup saved: repos may have changed).
const { EventEmitter } = require('node:events');
const store = require('../store');
const session = require('./session');
const engine = require('../game/engine');
const { SPECIES, PUSH_LOOKUPS_PER_SYNC } = require('../game/catalog');
const { commitKey, pendingPushes } = require('../game/commits');
const { reviewQueue, attentionOf } = require('../game/pull-requests');
const { unlockedOf } = require('../game/achievements');
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
  // Open PRs waiting for the user's review, as fetched (every repo); null until the first fetch. Not saved:
  // it is only the current queue. `status().reviewQueue` is the selected repos' part of it.
  #reviewRequests = null;
  #reviewsAt = 0;
  #reviewing = null;
  #teams = { slugs: [], at: 0 }; // the teams of the user ('org/slug'), read again every LIVE.TEAMS_REFRESH_MS

  isConfigured() {
    const { pet, repos } = store.get();
    return session.isConnected() && Boolean(pet) && repos.length > 0;
  }

  status() {
    const state = store.get();
    const status = engine.computeStatus(state);
    return (
      status && {
        ...status,
        reviewQueue: this.#reviewRequests && reviewQueue(this.#reviewRequests, state.repos),
        syncing: Boolean(this.#syncing),
        error: this.#error,
      }
    );
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
      profileUpdatedAt: new Date().toISOString(),
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
    this.#reviewRequests = null; // a new baseline: the requests that are already there do not count as new
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
        gh.activity(state.user.login, from, this.#poll), // reviews, issues, pushes; null = 304, nothing new
        gh.pullRequestsSince(since, { backfill }),
        this.refreshReviews({ gh }), // never rejects: a failure keeps the last queue
      ]);
      this.#error = null;
      const { commits, pushes, incomplete } = await this.#resolvePushes(gh, state, events ?? []);
      // Pushes left for later must not hide behind a 304: fetch the events again next time.
      if (incomplete) this.#poll.etag = null;
      const at = new Date().toISOString();
      const { delta } = this.#absorb(
        { events: events ?? [], prs, commits, pushes },
        { lastSyncedAt: at, prsSyncedAt: at },
      );
      if (this.#baselined && Object.keys(delta).length > 0) this.emit('activity', delta);
      this.#baselined = true;
      this.#checkProgress();
      this.#checkAchievements();
    } catch (err) {
      console.error('[sync]', err);
      this.#poll.etag = null; // a failed sync must not hide events behind a 304
      this.#error = err.message;
    }
  }

  /**
   * Fetches the PRs waiting for the user's review. A failure is logged and the last queue stays.
   * `maxAgeMs`: skip when the queue is fresher than that. Reuses the in-flight fetch. Never rejects.
   */
  refreshReviews({ gh, maxAgeMs = 0 } = {}) {
    if (!this.isConfigured() || Date.now() - this.#reviewsAt < maxAgeMs) return Promise.resolve();
    this.#reviewing ??= this.#fetchReviews(gh).finally(() => (this.#reviewing = null));
    return this.#reviewing;
  }

  /** Tells whoever listens what just happened to the user's PRs (moments from the PR watcher, see pr-diff.js). */
  announce(moments) {
    if (!this.isConfigured() || moments.length === 0) return;
    this.emit(
      'attention',
      moments.map(({ kind, pr }) => attentionOf(kind, pr)),
    );
  }

  /** The user's teams: a request to one of them is a request to the user. A failure keeps the last list. */
  async #myTeams(client, login) {
    if (Date.now() - this.#teams.at < LIVE.TEAMS_REFRESH_MS) return this.#teams.slugs;
    try {
      this.#teams = { slugs: await client.myTeams(login), at: Date.now() };
    } catch (err) {
      console.error('[sync] teams', err.message); // tried again with the next fetch
    }
    return this.#teams.slugs;
  }

  async #fetchReviews(gh) {
    try {
      const client = gh ?? (await session.client());
      const { login } = store.get().user;
      const prs = await client.reviewRequests({ login, teams: await this.#myTeams(client, login) });
      this.#reviewsAt = Date.now();
      const known = new Set(this.#reviewRequests?.map((pr) => pr.id));
      const first = this.#reviewRequests === null; // the first fetch is the baseline: nothing in it is news
      this.#reviewRequests = prs;
      const added = first ? [] : reviewQueue(prs, store.get().repos).filter((pr) => !known.has(pr.id));
      if (added.length > 0) {
        this.emit('activity', { reviewRequests: added.length });
        this.emit(
          'attention',
          added.map((pr) => attentionOf('reviewRequested', pr)),
        );
      }
      this.notify();
    } catch (err) {
      console.error('[sync] review requests', err.message);
    }
  }

  /**
   * Commits come from pushes (the event does not say how many a push has): looks up the new pushes, newest first,
   * at most PUSH_LOOKUPS_PER_SYNC per sync. A push whose lookup fails stays unresolved and is tried again.
   * @returns the commit records, the pushes resolved, and whether some pushes are still to do
   */
  async #resolvePushes(gh, { user, repos, activity }, events) {
    const pending = pendingPushes(activity, events, repos);
    const commits = [];
    const pushes = [];
    let failed = false;
    for (const push of pending.slice(0, PUSH_LOOKUPS_PER_SYNC)) {
      try {
        for (const commit of await gh.pushCommits(push.repo, push, user.login)) {
          commits.push({ key: commitKey(push.repo, commit), day: push.day });
        }
        pushes.push({ id: push.id, day: push.day });
      } catch (err) {
        console.error(`[sync] push ${push.id} in ${push.repo}`, err.message);
        failed = true;
      }
    }
    return { commits, pushes, incomplete: failed || pending.length > PUSH_LOOKUPS_PER_SYNC };
  }

  /** Fresh PR list from the live PR watcher (~10 s): keeps PR data and XP current between syncs. */
  applyPullRequests(prs) {
    // Only after the first sync: the backfill and the reaction baseline come from there.
    if (!this.isConfigured() || !this.#baselined || !store.get().activity.prsSyncedAt) return;
    const { delta, changed } = this.#absorb({ prs });
    if (!changed) return;
    if (Object.keys(delta).length > 0) this.emit('activity', delta);
    this.#checkProgress();
    this.#checkAchievements();
    this.notify();
  }

  /**
   * Stores fresh data in the ledger. Returns the activity it added that no live source celebrated
   * yet (`delta`, see live/credits.js) and whether the stored activity changed.
   */
  #absorb({ events, prs, commits, pushes }, marks = {}) {
    const { activity: before, repos } = store.get();
    const activity = { ...engine.applyActivity(before, { events, prs, commits, pushes, repos }), ...marks };
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

  /**
   * Records the achievements reached (they are never lost, even if the history is rebuilt) and announces the new
   * ones. The first time it only records them, so a pet that already had some (an update, a restored save)
   * does not celebrate them all at once.
   */
  #checkAchievements() {
    const status = engine.computeStatus(store.get());
    if (!status) return;
    const known = store.get().pet.achievements;
    const fresh = unlockedOf(status.achievements).filter((a) => !known || !(a.id in known));
    if (known && fresh.length === 0) return;
    store.update((s) => ({
      pet: {
        ...s.pet,
        achievements: { ...s.pet.achievements, ...Object.fromEntries(fresh.map((a) => [a.id, a.unlockedAt])) },
      },
    }));
    if (known)
      this.emit(
        'achievements',
        fresh.map(({ id, name, description, icon, tier, points }) => ({ id, name, description, icon, tier, points })),
      );
  }
}

module.exports = new PetService();
