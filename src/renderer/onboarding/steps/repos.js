// Step 2: pick the repos that count for the pet.
import { $, h } from '../../shared/dom.js';

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

export function createReposStep({ api, state, go, toast }) {
  const list = $('#repo-list');
  const search = $('#repo-search');
  const nextBtn = $('#btn-repos-next');
  let repos = null; // [{ fullName, private, recent }]
  let loadedFor = null; // login the list was loaded for

  const recentNames = () => repos.filter((r) => r.recent > 0).map((r) => r.fullName);

  function renderRow(repo) {
    const [owner, name] = repo.fullName.split('/');
    return h(
      'li',
      {},
      h(
        'label',
        { class: 'repo' },
        h('input', {
          type: 'checkbox',
          class: 'check',
          checked: state.selectedRepos.has(repo.fullName),
          onchange: (e) => toggle(repo.fullName, e.target.checked),
        }),
        h('span', { class: 'repo-name' }, h('span', { class: 'repo-owner' }, `${owner}/`), name),
        repo.private && h('span', { class: 'badge muted', title: 'Private' }, '🔒'),
        repo.recent > 0 && h('span', { class: 'badge', title: 'Recent activity' }, `★ ${repo.recent}`),
      ),
    );
  }

  /** Row to add a hand-typed repo that isn't in the list. */
  function renderAddRow(fullName) {
    return h(
      'li',
      {},
      h(
        'button',
        {
          class: 'repo add',
          onclick: () => {
            repos.unshift({ fullName, private: false, recent: 0 });
            search.value = '';
            toggle(fullName, true);
            render();
          },
        },
        `+ Add ${fullName}`,
      ),
    );
  }

  function render() {
    const query = search.value.trim().toLowerCase();
    const visible = repos.filter((r) => r.fullName.toLowerCase().includes(query));
    const canAdd = REPO_PATTERN.test(query) && !repos.some((r) => r.fullName.toLowerCase() === query);

    list.replaceChildren(
      ...(canAdd ? [renderAddRow(search.value.trim())] : []),
      ...visible.map(renderRow),
      ...(!visible.length && !canAdd ? [h('li', { class: 'repo-empty' }, 'No matching repos')] : []),
    );
    updateCount();
  }

  function updateCount() {
    const n = state.selectedRepos.size;
    $('#repo-count').textContent = `${n} selected`;
    nextBtn.disabled = n === 0;
  }

  function toggle(fullName, on) {
    if (on) state.selectedRepos.add(fullName);
    else state.selectedRepos.delete(fullName);
    updateCount();
  }

  function selectOnly(names) {
    state.selectedRepos = new Set(names);
    render();
  }

  async function load() {
    list.replaceChildren(h('li', { class: 'repo-empty' }, 'Loading your repos…'));
    try {
      repos = await api.onboarding.listRepos();
      loadedFor = state.user.login;
      // Saved repos missing from the list (e.g. added by hand).
      for (const name of state.selectedRepos)
        if (!repos.some((r) => r.fullName === name)) repos.unshift({ fullName: name, private: false, recent: 0 });
      if (state.selectedRepos.size === 0) state.selectedRepos = new Set(recentNames());
      render();
    } catch (err) {
      list.replaceChildren(h('li', { class: 'repo-empty' }, "Couldn't load your repos."));
      toast(err);
    }
  }

  search.addEventListener('input', () => repos && render());
  $('#btn-select-recent').addEventListener('click', () => repos && selectOnly(recentNames()));
  $('#btn-select-none').addEventListener('click', () => repos && selectOnly([]));
  nextBtn.addEventListener('click', () => go('pet'));

  return {
    enter() {
      if (loadedFor !== state.user?.login) load();
      else render();
      search.focus();
    },
  };
}
