// The menu: the few things nobody needs every day (vacation, hide the pet, the card, settings, quit). It opens from a
// right-click on the pet or on the menu bar icon. The card is the home of everything else.
import { $, h } from '../shared/dom.js';
import { icon } from '../shared/ui.js';
import { vacationUntilText } from '../shared/vacation-text.js';

const api = window.gitgotchi.panel;
const app = $('#app');

let state = null;

const divider = () => h('hr', { class: 'divider' });

/** One row: a label, and on the right a hint (or any node). */
const item = (label, { onclick, end, className = '', ...attributes } = {}) =>
  h(
    'button',
    { class: `item ${className}`.trim(), type: 'button', onclick, ...attributes },
    h('span', {}, label),
    end ?? null,
  );
const hint = (text) => h('span', { class: 'hint' }, text);
const act = (name) => () => api.action(name);

/** Vacation: starts one (Settings opens to pick the day back). While on vacation, the row is the way back. */
function vacationItem({ pause }) {
  if (pause.active) {
    return item("I'm back", { onclick: act('resume'), end: hint(`On vacation ${vacationUntilText(pause)}`) });
  }
  return item('Vacation…', { onclick: act('startVacation') });
}

function render(next = state) {
  state = next;
  if (!state) return;
  const { status, configured, petVisible } = state;
  const ready = configured && status;
  app.replaceChildren(
    ...(ready
      ? [
          vacationItem(status),
          item(petVisible ? 'Hide pet' : 'Show pet', { onclick: act('togglePet') }),
          divider(),
          item('Pet card', { onclick: act('openCard') }),
          item('Settings…', { onclick: act('openSettings') }),
        ]
      : [item('Set up Gitgotchi…', { onclick: act('openSettings') })]),
    divider(),
    item('Quit Gitgotchi', { onclick: act('quit') }),
    // Something went wrong with GitHub: say it, and offer to try again.
    ...(status?.error
      ? [
          h('p', { class: 'notice error', role: 'alert' }, status.error),
          item('Try again', { onclick: act('sync'), disabled: status.syncing }),
        ]
      : []),
  );
}

// ---------- Boot ----------

// The window height follows the content.
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);

// A menu that is opened again starts folded.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  lengthsOpen = false;
  render();
});

api.onState(render);
api.state().then(render);
