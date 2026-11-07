// Menu bar dropdown: the pet, its PR summary, everyday toggles and app actions, from the state pushed by main.
// Preferences that are set once live in the Settings window.
import { $, h } from '../shared/dom.js';
import { plural, totalXp, oldestDays, timeAgo } from '../shared/format.js';
import { xpBar, portraitImg } from '../shared/ui.js';

const api = window.gitgotchi.panel;
const app = $('#app');

const REFRESH_LABEL_MS = 30 * 1000; // "Synced N min ago" stays fresh while the dropdown is open
let state = null;

// ---------- Parts ----------

const divider = () => h('hr', { class: 'divider' });

function header({ name, species, stage, level, levelXp, levelXpNeeded }) {
  return h(
    'div',
    { class: 'head' },
    h('div', { class: 'thumb', style: { background: species.tint } }, portraitImg({ species, stage })),
    h(
      'div',
      { class: 'head-body' },
      h(
        'div',
        { class: 'head-title' },
        h('span', { class: 'pixel-name name' }, name),
        h('span', { class: 'meta' }, `${stage.name} · Lv ${level}`),
      ),
      xpBar(levelXp / levelXpNeeded, 'sm'),
      h(
        'div',
        { class: 'meta xp-line' },
        `${levelXp} / ${levelXpNeeded} XP · ${levelXpNeeded - levelXp} to level ${level + 1}`,
      ),
    ),
  );
}

/** A clickable summary row: colored dot, label, optional detail on the right. */
const prRow = (dot, label, detail, className = '') =>
  h(
    'button',
    { class: 'row pr-row', type: 'button', onclick: () => api.action('openPopover') },
    h('span', { class: `dot ${dot}` }),
    h('span', { class: 'grow' }, label),
    detail ? h('span', { class: `detail ${className}` }, detail) : null,
  );

function prSummary({ waiting, approved, mergedToday }) {
  const rows = [];
  if (waiting.length) {
    const days = oldestDays(waiting);
    rows.push(
      prRow('waiting', `${plural(waiting.length, 'PR')} waiting for review`, days ? `oldest ${days}d` : 'opened today'),
    );
  }
  if (approved.length) rows.push(prRow('approved', `${plural(approved.length, 'PR')} approved, ready to merge`));
  if (mergedToday.length)
    rows.push(prRow('', `${mergedToday.length} merged today`, `+${totalXp(mergedToday)} XP`, 'xp-text'));
  return rows.length
    ? rows
    : [h('div', { class: 'row static muted' }, h('span', { class: 'dot' }), 'No open PRs right now')];
}

/** A row with a switch; the whole row toggles. */
function toggleRow(label, name, checked) {
  const id = `label-${name}`;
  return h(
    'div',
    { class: 'row toggle', onclick: () => api.action(name) },
    h('span', { id }, label),
    h('button', {
      class: 'switch',
      type: 'button',
      role: 'switch',
      'aria-checked': String(checked),
      'aria-labelledby': id,
    }),
  );
}

/** A plain text row; `end` is the secondary text on the right. */
const linkRow = (label, { onclick, end, disabled } = {}) =>
  h(
    'button',
    { class: 'row item', type: 'button', onclick, disabled },
    h('span', {}, label),
    end ? h('span', { class: 'meta' }, end) : null,
  );

function syncedLabel(status) {
  if (status?.syncing) return 'Syncing…';
  return status?.lastSyncedAt ? `Synced ${timeAgo(status.lastSyncedAt)}` : 'Not synced yet';
}

// ---------- Render ----------

function render(next = state) {
  state = next;
  if (!state) return;
  const { status, configured, petVisible, doNotDisturb } = state;
  const ready = configured && status;
  app.replaceChildren(
    ...(ready
      ? [
          header(status),
          divider(),
          ...prSummary(status.prs ?? { waiting: [], approved: [], mergedToday: [] }),
          divider(),
          toggleRow('Show pet on desktop', 'togglePet', petVisible),
          toggleRow('Do not disturb', 'toggleDoNotDisturb', doNotDisturb),
        ]
      : [h('p', { class: 'welcome' }, 'No pet yet. Pick your repos to hatch one.')]),
    divider(),
    ...(ready
      ? [
          linkRow('Open profile…', { onclick: () => api.action('openProfile') }),
          linkRow('Refresh now', {
            onclick: () => api.action('sync'),
            end: syncedLabel(status),
            disabled: status.syncing,
          }),
        ]
      : []),
    linkRow(ready ? 'Settings…' : 'Set up Gitgotchi…', { onclick: () => api.action('openSettings'), end: '⌘ ,' }),
    divider(),
    linkRow('Quit Gitgotchi', { onclick: () => api.action('quit'), end: '⌘ Q' }),
    ...(status?.error ? [h('p', { class: 'notice error', role: 'alert' }, status.error)] : []),
  );
}

// ---------- Boot ----------

document.addEventListener('keydown', (e) => {
  if (!e.metaKey) return;
  if (e.key === ',') api.action('openSettings');
  else if (e.key === 'q') api.action('quit');
});

// The window height follows the content.
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);
setInterval(() => render(), REFRESH_LABEL_MS);

api.onState(render);
api.state().then(render);
