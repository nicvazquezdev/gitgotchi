// The menu: the few things nobody needs every day (pause, hide the pet, the card, the pet page, settings, quit). It opens from a
// right-click on the pet or on the menu bar icon, or from the dots of the card. The card is the home of everything else.
import { $, h } from '../shared/dom.js';
import { icon } from '../shared/ui.js';
import { pauseUntilText } from '../shared/pause-text.js';

const api = window.gitgotchi.panel;
const app = $('#app');

let state = null;
let lengthsOpen = false; // the three lengths of a pause are unfolded

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

/** Pause: the three lengths unfold under it. While something is paused, the row is the way back. */
function pauseItems({ pause }) {
  if (pause.active) {
    return [item('Resume', { onclick: act('resume'), end: hint(`Paused ${pauseUntilText(pause)}`) })];
  }
  const toggle = () => {
    lengthsOpen = !lengthsOpen;
    render();
  };
  return [
    item('Pause', {
      onclick: toggle,
      end: icon('chevron', { size: 12, stroke: 2.5 }),
      'aria-expanded': String(lengthsOpen),
    }),
    ...(lengthsOpen
      ? [
          h(
            'div',
            { class: 'lengths' },
            item('For 1 hour', { onclick: act('pauseHour') }),
            item('Until tomorrow', { onclick: act('pauseTomorrow') }),
            item('Vacation…', { onclick: act('pauseVacation') }),
          ),
        ]
      : []),
  ];
}

function render(next = state) {
  state = next;
  if (!state) return;
  const { status, configured, petVisible } = state;
  const ready = configured && status;
  app.replaceChildren(
    ...(ready
      ? [
          ...pauseItems(status),
          item(petVisible ? 'Hide pet' : 'Show pet', { onclick: act('togglePet') }),
          divider(),
          item('Pet card', { onclick: act('openCard') }),
          item('Pet page', { onclick: act('openProfile') }),
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
