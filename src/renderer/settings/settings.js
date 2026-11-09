// Settings window: preferences that are set once. The page is built once; every state pushed by main
// updates it in place, so keyboard focus and a slider being dragged are never lost.
import { $, h } from '../shared/dom.js';
import { plural, timeAgo } from '../shared/format.js';
import { icon } from '../shared/ui.js';
import { pauseKind, pauseUntilText, tomorrowOf } from '../shared/pause-text.js';

const api = window.gitgotchi.settings;
const REFRESH_LABEL_MS = 30 * 1000; // keeps "Last saved N min ago" current

// ---------- Rows ----------
// Each row is { el, update(state) }.

/**
 * Label and hint on the left, a switch on the right.
 * `describe(state)` -> { checked, hint, error?, busy?, link?: { label, action } }; a busy switch ignores clicks.
 * The optional link goes at the end of the hint and sends `link.action`.
 */
function switchRow(label, action, describe) {
  const id = `switch-${action}`;
  const text = h('span');
  let linkAction = null;
  const link = h('button', { class: 'link', type: 'button', onclick: () => linkAction && api.action(linkAction) });
  const hint = h('p', { class: 'hint', id: `${id}-hint` }, text, ' ', link);
  const control = h('button', {
    id,
    class: 'switch',
    type: 'button',
    role: 'switch',
    'aria-describedby': hint.id,
    onclick: () => api.action(action),
  });
  return {
    el: h(
      'div',
      { class: 'setting' },
      h('div', { class: 'setting-text' }, h('label', { htmlFor: id }, label), hint),
      control,
    ),
    update(state) {
      const { checked, hint: message, error = false, busy = false, link: extra } = describe(state);
      control.setAttribute('aria-checked', String(checked));
      control.disabled = busy;
      text.textContent = message;
      linkAction = extra?.action ?? null;
      link.textContent = extra?.label ?? '';
      link.hidden = !extra;
      hint.classList.toggle('error', error);
      hint.classList.toggle('busy', busy);
    },
  };
}

/** Pet size slider, shown as a percentage of the size the sprites are drawn for. */
function sizeRow() {
  const slider = h('input', { id: 'pet-size', class: 'slider', type: 'range' });
  const value = h('span', { class: 'size-value', 'aria-hidden': 'true' });
  let defaultSize = 1;
  let dragging = false; // while the slider is held, pushed states must not move it
  let frame = 0;

  const paint = () => {
    const { min, max } = slider;
    const label = `${Math.round((slider.value / defaultSize) * 100)}%`;
    slider.style.setProperty('--fill', `${((slider.value - min) / (max - min)) * 100}%`);
    slider.setAttribute('aria-valuetext', label);
    value.textContent = label;
  };

  // Live resize: at most one message per frame; the final value is saved on release.
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

  return {
    el: h(
      'div',
      { class: 'setting' },
      h('div', { class: 'setting-text' }, h('label', { htmlFor: slider.id }, 'Pet size')),
      h('div', { class: 'size-control' }, slider, value),
    ),
    update({ petSize, sizeRange, defaultPetSize }) {
      defaultSize = defaultPetSize;
      slider.min = sizeRange.min;
      slider.max = sizeRange.max;
      slider.step = sizeRange.step; // whole multiples of the sprite box: pixels stay sharp
      if (!dragging) slider.value = petSize;
      paint();
    },
  };
}

/** How long the pet is quiet: off, an hour, until tomorrow or a vacation (the same lengths as the menu). */
function pauseRow() {
  const ACTIONS = { off: 'resume', hour: 'pauseHour', tomorrow: 'pauseTomorrow', vacation: 'pauseVacation' };
  const LABELS = { off: 'Off', hour: 'For 1 hour', tomorrow: 'Until tomorrow', vacation: 'Vacation' };
  const select = h(
    'select',
    { id: 'pause-length', 'aria-describedby': 'pause-hint', onchange: () => api.action(ACTIONS[select.value]) },
    Object.entries(LABELS).map(([value, label]) => h('option', { value }, label)),
  );
  const hint = h('p', { class: 'hint', id: 'pause-hint' });
  return {
    el: h(
      'div',
      { class: 'setting' },
      h('div', { class: 'setting-text' }, h('label', { htmlFor: select.id }, 'Pause'), hint),
      h('span', { class: 'select' }, select, icon('down', { size: 14, stroke: 2.5 })),
    ),
    update({ pause }) {
      select.value = pauseKind(pause);
      hint.textContent = pause.active
        ? `Paused ${pauseUntilText(pause)}. Your streak is safe.`
        : 'Quiet the pet and keep your streak safe.';
    },
  };
}

/** The day the person is back from a vacation; only shown during one. Empty: it lasts until they resume. */
function returnRow() {
  const input = h('input', { id: 'pause-return', class: 'date', type: 'date' });
  input.addEventListener('change', () => api.setPauseReturn(input.value || null));
  const el = h(
    'div',
    { class: 'setting' },
    h(
      'div',
      { class: 'setting-text' },
      h('label', { htmlFor: input.id }, 'Back on'),
      h('p', { class: 'hint' }, 'The first day that counts again. Without a date, the pause lasts until you resume.'),
    ),
    input,
  );
  return {
    el,
    update({ pause }) {
      el.hidden = pauseKind(pause) !== 'vacation';
      input.min = tomorrowOf();
      if (document.activeElement !== input) input.value = pause.backOn ?? ''; // do not move it under the person's hands
    },
  };
}

/** Connected account and repo count; the button reopens the setup flow. */
function accountRow() {
  const hint = h('p', { class: 'hint' });
  return {
    el: h(
      'div',
      { class: 'setting' },
      h('div', { class: 'setting-text' }, h('span', { class: 'label' }, 'Account'), hint),
      h('button', { class: 'btn sm', type: 'button', onclick: () => api.action('openSetup') }, 'Change…'),
    ),
    update({ login, repoCount }) {
      hint.textContent = login ? `@${login} · ${plural(repoCount, 'repo')}` : 'Not connected';
    },
  };
}

/** What the backup is doing right now, in the order the steps run when it is turned on. */
const BACKUP_STEPS = {
  checking: () => 'Checking your GitHub account…',
  creating: (repo) => `Creating the private repo ${repo}…`,
  pulling: () => 'Looking for a saved pet…',
  saving: () => 'Saving your pet…',
};

function backupHint({ cloud }) {
  if (cloud.phase) return { checked: true, hint: BACKUP_STEPS[cloud.phase](cloud.repo), busy: true };
  if (cloud.error) return { checked: cloud.enabled, hint: `Backup failed: ${cloud.error}`, error: true };
  const openRepo = { label: 'Open on GitHub', action: 'openSaveRepo' };
  if (!cloud.enabled) {
    // Turning the backup off stops syncing; it never deletes the repo.
    if (cloud.saved) {
      return {
        checked: false,
        hint: `Off. Your last save stays in ${cloud.repo}. Delete that repo on GitHub to remove it.`,
        link: openRepo,
      };
    }
    return {
      checked: false,
      hint: 'A private repo in your GitHub account, so your pet follows you to other computers. No repo names, PR titles or code.',
    };
  }
  const saved = cloud.lastPushAt ? ` Last saved ${timeAgo(cloud.lastPushAt)}.` : '';
  return {
    checked: true,
    hint: `Saved in your private repo ${cloud.repo}.${saved} No repo names, PR titles or code in it.`,
    link: openRepo,
  };
}

// ---------- Page ----------

// Settings come in three groups of rows, with no titles: the pet, what talks to you, and the account.
const group = (...rows) =>
  h(
    'section',
    { class: 'card' },
    rows.map((row) => row.el),
  );

const rows = {
  size: sizeRow(),
  bubbles: switchRow('Speech bubbles', 'toggleSpeechBubbles', ({ speechBubbles, pause }) => ({
    checked: speechBubbles,
    hint: pause.active ? 'Hidden for now: the pet is paused.' : 'Short messages above the pet.',
  })),
  pause: pauseRow(),
  pauseReturn: returnRow(),
  account: accountRow(),
  backup: switchRow('Back up pet', 'toggleCloudSync', backupHint),
  openAtLogin: switchRow('Open at login', 'toggleOpenAtLogin', ({ openAtLogin }) => ({
    checked: openAtLogin,
    hint: 'Starts Gitgotchi when you log in.',
  })),
};

const app = $('#app');
app.hidden = true; // until the first state arrives
app.append(
  group(rows.size, rows.bubbles),
  group(rows.pause, rows.pauseReturn),
  group(rows.account, rows.backup, rows.openAtLogin),
);

let state = null;

function update(next = state) {
  state = next;
  if (!state) return;
  for (const row of Object.values(rows)) row.update(state);
  app.hidden = false;
}

api.onState(update);
api.state().then(update);
setInterval(() => update(), REFRESH_LABEL_MS);
