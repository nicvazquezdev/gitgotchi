// Step 1: connect to GitHub using the `gh` CLI session (and offer a cloud save, if there is one).
import { h } from '../../shared/dom.js';
import { icon, spriteImg } from '../../shared/ui.js';
import { button, illustration, statusCard, stepProgress } from './parts.js';

const HELP = {
  GH_NOT_FOUND: { title: 'GitHub CLI not found', command: 'brew install gh && gh auth login' },
  DEFAULT: { title: 'Not signed in to gh', command: 'gh auth login' },
};

export function createLoginStep({ api, catalog, state, go, toast }) {
  const trio = ['jelly', 'phoenix', 'mushroom'].map((id) => catalog.species.find((s) => s.id === id));

  return {
    render() {
      const slot = h('div', { class: 'slot' });
      const show = (...nodes) => slot.replaceChildren(...nodes.filter(Boolean));
      let accounts = null; // last answer of auth:accounts

      const heading = [
        stepProgress(1),
        h('h1', { class: 'pixel-title' }, 'Connect GitHub'),
        h(
          'p',
          { class: 'lead' },
          'Your pet earns XP from your pull requests and reviews. Gitgotchi reads your activity through the gh session you already have. No tokens to paste, and it never reads your code.',
        ),
      ];
      const footnote = h('p', { class: 'footnote' }, 'You can disconnect anytime in Settings.');

      function showHelp({ error, message }) {
        const { title, command } = HELP[error] ?? HELP.DEFAULT;
        show(
          statusCard({ tone: 'warning', title, text: message }),
          h('div', { class: 'terminal' }, h('span', { class: 'prompt' }, '$'), command),
          button('Retry', { onclick: start }, { primary: true, large: true }),
        );
      }

      /** Connects with one gh account. Returns true on success. */
      async function connectAs(login) {
        show(statusCard({ title: 'Looking for your gh session…' }));
        const result = await api.auth.connect(login);
        if (!result.user) return (showHelp(result), false);
        state.user = result.user;
        return true;
      }

      /** Account picker: a row per gh login. */
      function showPicker({ accounts: list, selected: preselected, missing }) {
        let selected = preselected;
        const rows = list.map((a) =>
          h(
            'button',
            { class: 'account', role: 'radio', onclick: () => select(a.login) },
            a.avatarUrl
              ? h('img', { src: a.avatarUrl, alt: '', width: 28, height: 28 })
              : h('span', { class: 'avatar' }),
            h('span', { class: 'account-login' }, `@${a.login}`),
            a.active && h('span', { class: 'count-chip' }, 'gh active'),
            h('span', { class: 'account-mark' }, icon('check', { size: 14, stroke: 3 })),
          ),
        );
        const next = button('', { onclick: proceed }, { primary: true, large: true });
        function select(login) {
          selected = login;
          list.forEach((a, i) => rows[i].setAttribute('aria-checked', String(a.login === login)));
          next.textContent = `Continue as @${login}`;
        }
        async function proceed() {
          if (await connectAs(selected)) await connected();
        }
        select(selected);
        show(
          missing && h('p', { class: 'notice' }, `@${missing} is no longer logged in to gh. Pick another account.`),
          h('div', { class: 'account-list', role: 'radiogroup', 'aria-label': 'GitHub account' }, rows),
          next,
        );
      }

      /** "Not you?": a picker if gh has several accounts, otherwise how to log in with another one. */
      function notYou() {
        if (accounts?.accounts.length > 1) return showPicker({ ...accounts, selected: state.user.login });
        showHelp({ message: `Signed in as @${state.user.login}. Log in with another account:` });
      }

      /** Signed in: look for a cloud save before showing the result. */
      async function connected() {
        const save = await api.cloud.find().catch(() => ({ found: false }));
        showConnected({ restorable: save.found && save.pet });
      }

      function showConnected({ restorable } = {}) {
        const { login } = state.user;
        const status = statusCard({
          tone: 'success',
          title: 'gh session found',
          text: `Signed in as @${login} on github.com`,
          action: button('Not you?', { class: 'link', onclick: notYou }),
        });
        if (restorable) return show(status, cloudCard(restorable));
        show(status, button(`Continue as @${login}`, { onclick: () => go('repos') }, { primary: true, large: true }));
      }

      /** A cloud save was found: restore it, or carry on with a new pet. */
      function cloudCard({ name, speciesId, stageIndex, level }) {
        const stage = catalog.species.find((s) => s.id === speciesId)?.stages[stageIndex];
        const restore = button('Restore', {}, { primary: true });
        restore.addEventListener('click', async () => {
          restore.disabled = true;
          try {
            await api.cloud.restore(); // main closes this window and shows the pet
          } catch (err) {
            toast(err);
            restore.disabled = false;
          }
        });
        return h(
          'div',
          { class: 'cloud-card' },
          stage && h('span', { class: 'cloud-sprite' }, spriteImg(stage.file, stage.size, 1)),
          h(
            'span',
            { class: 'status-text' },
            h('strong', {}, `We found your pet ${name} in your GitHub`),
            h('span', {}, `Level ${level}`),
          ),
          restore,
          button('Start fresh', { class: 'link', onclick: () => showConnected() }),
        );
      }

      /** One account connects right away; several ask the user to pick. */
      async function start() {
        show(statusCard({ title: 'Looking for your gh session…' }));
        accounts = await api.auth.accounts();
        if (accounts.error) return showHelp(accounts);
        if (accounts.accounts.length > 1) return showPicker(accounts);
        if (await connectAs(accounts.accounts[0].login)) await connected();
      }

      // Always re-check `gh`: the saved account may be gone if it was logged out since.
      start();

      return h(
        'div',
        { class: 'split' },
        illustration({
          species: trio,
          tone: 'lilac',
          tagline: 'A pixel companion that lives on your desktop and grows with every PR you ship.',
        }),
        h('div', { class: 'pane centered' }, ...heading, slot, footnote),
      );
    },
  };
}
