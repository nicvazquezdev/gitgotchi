// Step 1: connect to GitHub using the `gh` CLI session.
import { $ } from '../../shared/dom.js';
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
    nextBtn.hidden = view !== 'done';
  }

  function showUser() {
    $('#user-avatar').src = state.user.avatarUrl;
    $('#user-login').textContent = `@${state.user.login}`;
    show('done');
  }

  async function connect() {
    show('checking');
    const { user, error, message } = await api.auth.connect();
    if (user) {
      state.user = user;
      return showUser();
    }
    $('#gh-error').textContent = message;
    $('#gh-command').textContent = COMMANDS[error] ?? DEFAULT_COMMAND;
    show('help');
  }

  $('#btn-retry').addEventListener('click', connect);
  nextBtn.addEventListener('click', () => go('repos'));

  return {
    // Always re-check `gh`: the saved user may be stale if gh was logged out since.
    enter: connect,
  };
}
