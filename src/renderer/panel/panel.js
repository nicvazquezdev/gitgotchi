// Menu bar dropdown: the pet, its PR summary, toggles and app actions, from the state pushed by main.
import { $, h } from '../shared/dom.js';
import { plural, totalXp, oldestDays, timeAgo } from '../shared/format.js';
import { xpBar, portraitImg } from '../shared/ui.js';

const api = window.gitgotchi.panel;
const app = $('#app');

const REFRESH_LABEL_MS = 30 * 1000; // "Synced N min ago" stays fresh while the dropdown is open
let state = null;
let dragging = false; // while the slider is held, pushed states must not rebuild it

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

function sizeRow({ petSize, sizeRange }) {
  const value = h('span', { class: 'meta size-value' }, `${petSize} px`);
  const slider = h('input', {
    class: 'slider',
    type: 'range',
    min: sizeRange.min,
    max: sizeRange.max,
    step: 1,
    value: petSize,
    'aria-label': 'Pet size',
  });
  const paint = () => {
    slider.style.setProperty('--fill', `${((slider.value - sizeRange.min) / (sizeRange.max - sizeRange.min)) * 100}%`);
    value.textContent = `${slider.value} px`;
  };

  // Live resize: at most one message per frame; the final value is saved on release.
  let frame = 0;
  slider.addEventListener('input', () => {
    paint();
    dragging = true;
    if (!frame) {
      frame = requestAnimationFrame(() => {
        frame = 0;
        api.setSize({ size: Number(slider.value), commit: false });
      });
    }
  });
  slider.addEventListener('change', () => {
    cancelAnimationFrame(frame);
    frame = 0;
    dragging = false;
    api.setSize({ size: Number(slider.value), commit: true });
  });
  paint();

  return h('div', { class: 'row size' }, h('span', {}, 'Pet size'), slider, value);
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
  if (dragging || !state) return; // the slider owns the screen until released
  const { status, configured, petVisible, speechBubbles, doNotDisturb, openAtLogin, cloudSync } = state;
  const ready = configured && status;
  app.replaceChildren(
    ...(ready
      ? [
          header(status),
          divider(),
          ...prSummary(status.prs ?? { waiting: [], approved: [], mergedToday: [] }),
          divider(),
        ]
      : [h('p', { class: 'welcome' }, 'No pet yet. Pick your repos to hatch one.'), divider()]),
    ...(ready
      ? [
          toggleRow('Show pet on desktop', 'togglePet', petVisible),
          toggleRow('Speech bubbles', 'toggleSpeechBubbles', speechBubbles),
          toggleRow('Do not disturb', 'toggleDoNotDisturb', doNotDisturb),
          toggleRow('Sync to GitHub', 'toggleCloudSync', cloudSync),
          sizeRow(state),
        ]
      : []),
    toggleRow('Open at login', 'toggleOpenAtLogin', openAtLogin),
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
    linkRow('Settings…', { onclick: () => api.action('openSettings'), end: '⌘ ,' }),
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
