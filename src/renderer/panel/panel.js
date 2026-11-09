// Menu bar dropdown: the pet, the companions (one click switches), its PR summary, everyday toggles and app actions,
// from the state pushed by main. Preferences that are set once live in the Settings window.
import { $, h } from '../shared/dom.js';
import { plural, totalXp, oldestDays, oldestWaitingDays, timeAgo } from '../shared/format.js';
import { icon, xpBar, portraitImg } from '../shared/ui.js';
import { pauseUntilText } from '../shared/pause-text.js';

const api = window.gitgotchi.panel;
const { catalog } = await window.gitgotchi.bootstrap(); // the art of every species (the status only has the active one)
const app = $('#app');

const REFRESH_LABEL_MS = 30 * 1000; // "Synced N min ago" stays fresh while the dropdown is open
let state = null;

// ---------- Parts ----------

const divider = () => h('hr', { class: 'divider' });

/** "75 XP to level 5", plus a hint when that level evolves the pet. */
function xpLine({ level, levelXp, levelXpNeeded, nextStage }) {
  const evolves = nextStage?.level === level + 1;
  return `${levelXpNeeded - levelXp} XP to level ${level + 1}${evolves ? ` · evolves into ${nextStage.name}` : ''}`;
}

function header({ name, species, stage, nextStage, level, levelXp, levelXpNeeded }) {
  return h(
    'div',
    { class: 'head' },
    h('div', { class: 'thumb night' }, portraitImg({ species, stage })),
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
      h('div', { class: 'meta xp-line' }, xpLine({ level, levelXp, levelXpNeeded, nextStage })),
    ),
  );
}

/**
 * One companion as a face: its creature on its color and its level, and a bolt on the one that is earning XP.
 * Clicking another one makes it the active pet.
 */
function face(entry) {
  const species = catalog.species.find((s) => s.id === entry.id);
  const label = entry.active ? `${entry.name}: earning XP` : `Switch to ${entry.name} (level ${entry.level})`;
  return h(
    'button',
    {
      class: `face night${entry.active ? ' active' : ''}`,
      type: 'button',
      title: label,
      'aria-label': label,
      'aria-pressed': String(entry.active),
      onclick: () => !entry.active && window.gitgotchi.pets.activate(entry.id),
    },
    portraitImg({ species, stage: { index: entry.stageIndex } }, 44),
    h('span', { class: 'face-lv', ariaHidden: 'true' }, entry.level),
    entry.active ? h('span', { class: 'face-bolt', ariaHidden: 'true' }, icon('bolt', { size: 9, stroke: 3 })) : null,
  );
}

/** The companions in a row, the last button hatches a new one while there is a species left. */
function party({ collection }) {
  const faces = collection.entries.filter((entry) => entry.hatched).map(face);
  const more = collection.hatched < collection.total;
  const open = () => api.action('openCollection');
  return h(
    'div',
    { class: 'party' },
    h(
      'div',
      { class: 'party-head' },
      h('span', { class: 'eyebrow' }, 'Companions'),
      h(
        'button',
        { class: 'link', type: 'button', onclick: open },
        `Collection ${collection.hatched}/${collection.total}`,
      ),
    ),
    h(
      'div',
      { class: 'party-row', role: 'group', 'aria-label': 'Companions' },
      faces,
      more
        ? h(
            'button',
            {
              class: 'face add',
              type: 'button',
              title: 'Hatch a new companion',
              'aria-label': 'Hatch a new companion',
              onclick: open,
            },
            icon('plus', { size: 16, stroke: 2.4 }),
          )
        : null,
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
    icon('chevron', { size: 12, stroke: 2.5 }),
  );

/** `reviewQueue`: PRs waiting for the user's review, oldest first (null until fetched). */
function prSummary({ waiting, approved, mergedToday }, reviewQueue) {
  const rows = [];
  if (reviewQueue?.length) {
    const days = oldestWaitingDays(reviewQueue); // since the user was asked; null when no request has a known date
    const label = reviewQueue.length === 1 ? '1 PR needs your review' : `${reviewQueue.length} PRs need your review`;
    rows.push(prRow('waiting', label, days === null ? null : days ? `oldest ${days}d` : 'asked today'));
  }
  if (waiting.length) {
    const days = oldestDays(waiting);
    rows.push(
      prRow('waiting', `${plural(waiting.length, 'of your PR')} in review`, days ? `oldest ${days}d` : 'opened today'),
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

/** Pause for an hour, or resume when something is paused. */
const pauseRow = (pause) =>
  pause.active
    ? linkRow('Resume', { onclick: () => api.action('resume'), end: `Paused ${pauseUntilText(pause)}` })
    : linkRow('Pause for an hour', { onclick: () => api.action('pauseHour') });

function syncedLabel(status) {
  if (status?.syncing) return 'Syncing…';
  return status?.lastSyncedAt ? `Synced ${timeAgo(status.lastSyncedAt)}` : 'Not synced yet';
}

// ---------- Render ----------

function render(next = state) {
  state = next;
  if (!state) return;
  const { status, configured, petVisible } = state;
  const ready = configured && status;
  app.replaceChildren(
    ...(ready
      ? [
          header(status),
          party(status),
          divider(),
          ...prSummary(status.prs ?? { waiting: [], approved: [], mergedToday: [] }, status.reviewQueue),
          divider(),
          toggleRow('Show pet on desktop', 'togglePet', petVisible),
          pauseRow(status.pause),
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
    linkRow(ready ? 'Settings…' : 'Set up Gitgotchi…', { onclick: () => api.action('openSettings') }),
    divider(),
    linkRow('Quit Gitgotchi', { onclick: () => api.action('quit') }),
    ...(status?.error ? [h('p', { class: 'notice error', role: 'alert' }, status.error)] : []),
  );
}

// ---------- Boot ----------

// The window height follows the content.
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);
setInterval(() => render(), REFRESH_LABEL_MS);

api.onState(render);
api.state().then(render);
