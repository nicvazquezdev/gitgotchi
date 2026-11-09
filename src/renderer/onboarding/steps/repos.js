// Step 2: pick the repos that count for the pet.
import { h } from '../../shared/dom.js';
import { icon } from '../../shared/ui.js';
import { button, hero, stepCount, stepProgress } from './parts.js';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** "today", "3 days ago", "2 months ago"… */
function ago(iso, now = Date.now()) {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / DAY_MS));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return 'over a year ago';
}

/** What we honestly know: the user's recent activity count and the last push (not their last PR). */
function repoMeta({ recent, pushedAt }) {
  if (recent > 0) return 'Active recently';
  if (pushedAt) return `Last push ${ago(pushedAt)}`;
  return 'No recent activity';
}

export function createReposStep({ api, catalog, state, go, toast }) {
  const trio = ['geode', 'ram', 'koi'].map((id) => catalog.species.find((s) => s.id === id));
  let repos = null; // [{ fullName, private, recent, pushedAt }]
  let loadedFor = null; // login the list was loaded for

  return {
    render() {
      let query = '';
      const list = h('div', { class: 'repo-list' });
      const count = h('span', { class: 'muted' });
      const selectAll = h('input', { type: 'checkbox', onchange: (e) => setVisible(e.target.checked) });
      // Someone who already has pets is done here: the pets are managed in the collection (the Pets tab of the card).
      const returning = Boolean(state.existingPet);
      const next = button(
        returning ? 'Save' : 'Continue',
        { onclick: returning ? save : () => go('pet') },
        { primary: true },
      );
      const search = h('input', {
        type: 'search',
        placeholder: 'Search repos',
        autocomplete: 'off',
        spellcheck: false,
        oninput: (e) => {
          query = e.target.value.trim();
          repos && render();
        },
      });

      const visible = () => repos.filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase()));

      function toggle(fullName, on) {
        if (on) state.selectedRepos.add(fullName);
        else state.selectedRepos.delete(fullName);
        updateSummary();
      }

      function setVisible(on) {
        visible().forEach((r) => toggle(r.fullName, on));
        render();
      }

      async function save() {
        next.disabled = true;
        try {
          await api.onboarding.finish({ repos: [...state.selectedRepos] }); // main closes this window
        } catch (err) {
          toast(err);
          next.disabled = state.selectedRepos.size === 0;
        }
      }

      function updateSummary() {
        const shown = repos ? visible() : [];
        const picked = shown.filter((r) => state.selectedRepos.has(r.fullName)).length;
        selectAll.checked = shown.length > 0 && picked === shown.length;
        selectAll.indeterminate = picked > 0 && picked < shown.length;
        selectAll.disabled = shown.length === 0;
        count.textContent = `${state.selectedRepos.size} of ${repos?.length ?? 0} selected`;
        next.disabled = state.selectedRepos.size === 0;
      }

      const row = (repo) =>
        h(
          'label',
          { class: 'repo' },
          h('input', {
            type: 'checkbox',
            checked: state.selectedRepos.has(repo.fullName),
            onchange: (e) => toggle(repo.fullName, e.target.checked),
          }),
          h('span', { class: 'repo-name' }, repo.fullName),
          repo.private && h('span', { class: 'count-chip' }, 'Private'),
          h('span', { class: 'meta' }, repoMeta(repo)),
        );

      /** Row to add a hand-typed repo that isn't in the list. */
      const addRow = (fullName) =>
        h(
          'button',
          {
            class: 'repo add',
            onclick: () => {
              repos.unshift({ fullName, private: false, recent: 0 });
              search.value = query = '';
              toggle(fullName, true);
              render();
            },
          },
          `+ Add ${fullName}`,
        );

      function render() {
        const rows = visible();
        const canAdd = REPO_PATTERN.test(query) && !repos.some((r) => r.fullName.toLowerCase() === query.toLowerCase());
        list.replaceChildren(
          ...(canAdd ? [addRow(query)] : []),
          ...rows.map(row),
          ...(!rows.length && !canAdd ? [h('p', { class: 'repo-empty' }, 'No matching repos')] : []),
        );
        updateSummary();
      }

      async function load() {
        list.replaceChildren(h('p', { class: 'repo-empty' }, 'Loading your repos…'));
        try {
          repos = await api.onboarding.listRepos();
          loadedFor = state.user.login;
          // Saved repos missing from the list (e.g. added by hand).
          for (const name of state.selectedRepos)
            if (!repos.some((r) => r.fullName === name)) repos.unshift({ fullName: name, private: false, recent: 0 });
          if (state.selectedRepos.size === 0)
            state.selectedRepos = new Set(repos.filter((r) => r.recent > 0).map((r) => r.fullName));
          render();
        } catch (err) {
          list.replaceChildren(h('p', { class: 'repo-empty' }, "Couldn't load your repos."));
          toast(err);
        }
      }

      if (loadedFor === state.user?.login) render();
      else load();
      updateSummary();

      return h(
        'div',
        { class: 'ob' },
        hero(trio),
        h(
          'div',
          { class: 'ob-body' },
          stepProgress(2, stepCount(state)),
          h('h1', { class: 'pixel-title' }, 'Pick your repos'),
          h('p', { class: 'lead' }, 'Only activity in these repos earns XP. You can change this later.'),
          h('label', { class: 'field' }, icon('search'), h('span', { class: 'sr-only' }, 'Search repos'), search),
          h(
            'div',
            { class: 'repo-card' },
            h('div', { class: 'repo-head' }, h('label', {}, selectAll, 'Select all'), count),
            list,
          ),
          h('div', { class: 'actions' }, button('Back', { onclick: () => go('login') }), next),
        ),
      );
    },
  };
}
