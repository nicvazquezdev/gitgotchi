// Step 1: connect to GitHub using the `gh` CLI session.
import { $, h } from '../../shared/dom.js';
import { animatePet } from '../../shared/sprite.js';

// Suggested command for each `auth:connect` error.
const COMMANDS = { GH_NOT_FOUND: 'brew install gh && gh auth login' };
const DEFAULT_COMMAND = 'gh auth login';

export function createLoginStep({ api, catalog, state, go }) {
  const views = document.querySelectorAll('.login-view');
  const nextBtn = $('#btn-login-next');

  // Egg that cycles through species colors while you wait.
  let eggSpecies = 0;
  setInterval(() => (eggSpecies = (eggSpecies + 1) % catalog.species.length), 2400);
  animatePet($('#hero-egg'), () => ({
    species: catalog.species[eggSpecies],
    stageIndex: 0,
    mood: 'happy',
    progress: 0.8,
  }));

  function show(view) {
    views.forEach((v) => (v.hidden = v.dataset.view !== view));
    nextBtn.hidden = view !== 'done' && view !== 'accounts';
  }

  function showUser() {
    $('#user-avatar').src = state.user.avatarUrl;
    $('#user-login').textContent = `@${state.user.login}`;
    show('done');
  }

  function showHelp({ error, message }) {
    $('#gh-error').textContent = message;
    $('#gh-command').textContent = COMMANDS[error] ?? DEFAULT_COMMAND;
    show('help');
  }

  /** Connects with one gh account. Returns true on success. */
  async function connectAs(login) {
    show('checking');
    const result = await api.auth.connect(login);
    if (!result.user) return (showHelp(result), false);
    state.user = result.user;
    return true;
  }

  // Account picker: one card per gh login, the preselected one is highlighted.
  let selected = null;

  function select(login) {
    selected = login;
    document.querySelectorAll('.account').forEach((el) => el.setAttribute('aria-checked', el.dataset.login === login));
  }

  function showPicker({ accounts, selected: preselected, missing }) {
    const note = $('#account-missing');
    note.hidden = !missing;
    note.textContent = missing ? `@${missing} is no longer logged in to gh. Pick another account.` : '';
    $('#account-list').replaceChildren(
      ...accounts.map((a) =>
        h(
          'li',
          {},
          h(
            'button',
            {
              class: 'account pixel-border',
              role: 'radio',
              dataset: { login: a.login },
              onclick: () => select(a.login),
            },
            h('img', { src: a.avatarUrl, alt: '', width: 48, height: 48 }),
            h('span', { class: 'account-login' }, `@${a.login}`),
            a.active && h('span', { class: 'badge muted' }, 'gh active'),
            h('span', { class: 'account-mark' }),
          ),
        ),
      ),
    );
    select(preselected);
    show('accounts');
  }

  /** One account connects right away; several ask the user to pick. */
  async function start() {
    show('checking');
    const result = await api.auth.accounts();
    if (result.error) return showHelp(result);
    if (result.accounts.length > 1) return showPicker(result);
    if (await connectAs(result.accounts[0].login)) showUser();
  }

  $('#btn-retry').addEventListener('click', start);
  nextBtn.addEventListener('click', async () => {
    // From the picker: connect first, then continue.
    if (!$('[data-view="accounts"]').hidden && !(await connectAs(selected))) return;
    go('repos');
  });

  return {
    // Always re-check `gh`: the saved account may be gone if it was logged out since.
    enter: start,
  };
}
