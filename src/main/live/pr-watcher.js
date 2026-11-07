// Polls the user's recent PRs (one small GraphQL query) to react to opened and merged PRs quickly.
// Fast while the user is active, slow when the system is idle, paused while the machine sleeps.
const { LIVE } = require('../config');
const { diffPullRequests } = require('./pr-diff');

class PrWatcher {
  #timer = null;
  #snapshot = null; // null = next check only sets the baseline
  #checking = null;
  #paused = false;

  /**
   * `powerMonitor`: Electron's. `isEnabled()`: whether the app is set up.
   * `fetchPrs()`: resolves normalized PRs. `getRepos()`: selected repos. `onActivity(delta)`: new activity.
   * `onPullRequests(prs)` (optional): every fetched list, so the app's PR data stays as fresh as the check.
   */
  constructor({ powerMonitor, isEnabled, fetchPrs, getRepos, onActivity, onPullRequests }) {
    Object.assign(this, { powerMonitor, isEnabled, fetchPrs, getRepos, onActivity, onPullRequests });
  }

  start() {
    this.powerMonitor.on('suspend', () => {
      this.#paused = true;
      clearTimeout(this.#timer);
    });
    this.powerMonitor.on('resume', () => {
      this.#paused = false;
      this.reset(); // what happened during sleep is not celebrated
      this.#schedule(0);
    });
    this.#schedule();
  }

  /** Forgets the snapshot: the next check is a new baseline (e.g. after the selected repos change). */
  reset() {
    this.#snapshot = null;
  }

  /** Checks now. Reuses the in-flight check. Never throws. */
  check() {
    this.#checking ??= this.#doCheck().finally(() => (this.#checking = null));
    return this.#checking;
  }

  async #doCheck() {
    if (!this.isEnabled()) return;
    try {
      const at = Date.now();
      const prs = await this.fetchPrs();
      const { snapshot, delta } = diffPullRequests(this.#snapshot, prs, this.getRepos(), at);
      this.#snapshot = snapshot;
      // Reaction first: the credit it leaves keeps the ledger update below from reacting a second time.
      if (Object.keys(delta).length > 0) this.onActivity(delta);
      this.onPullRequests?.(prs);
    } catch (err) {
      console.error('[live] PR check failed:', err.message);
    }
  }

  #schedule(delay = this.#interval()) {
    clearTimeout(this.#timer);
    if (this.#paused) return;
    this.#timer = setTimeout(async () => {
      await this.check();
      this.#schedule();
    }, delay);
  }

  #interval() {
    return this.powerMonitor.getSystemIdleTime() > LIVE.IDLE_AFTER_S ? LIVE.PR_POLL_IDLE_MS : LIVE.PR_POLL_MS;
  }
}

module.exports = { PrWatcher };
