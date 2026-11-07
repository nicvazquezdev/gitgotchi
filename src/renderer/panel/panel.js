// Menu-bar panel: renders the pet's stats and the app actions from the state pushed by main.
import { $, h } from '../shared/dom.js';

const api = window.gitgotchi.panel;
const app = $('#app');

const BAR_MAX_PX = 40;
const weekdayInitial = (day) => new Date(`${day}T00:00`).toLocaleDateString('en-US', { weekday: 'narrow' });

let dragging = false; // while the slider is held, pushed states must not rebuild it

// ---------- Sections ----------

function header({ name, stage, nextStage, xp, progress, weekScore, hearts, maxHearts, syncing }) {
  const toNext = nextStage ? `${nextStage.minXp - xp} to ${nextStage.name}` : 'Max stage';
  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'head-top' },
      h('span', { class: 'name display' }, name),
      h(
        'span',
        { class: 'hearts', title: `${hearts}/${maxHearts} hearts` },
        ...Array.from({ length: maxHearts }, (_, i) => h('span', { class: i < hearts ? '' : 'empty' }, '♥')),
      ),
    ),
    h(
      'div',
      { class: 'head-sub' },
      h('span', { class: 'badge gold' }, stage.name.toUpperCase()),
      syncing ? h('span', { class: 'sync-dot display' }, '↻') : null,
    ),
    h('div', { class: 'xp-bar' }, h('div', { class: 'xp-fill', style: { width: `${Math.round(progress * 100)}%` } })),
    h(
      'div',
      { class: 'stat-row' },
      h('span', {}, h('b', {}, `${xp} XP`), ` · ${toNext}`),
      h('span', {}, h('b', {}, weekScore), ' pts/wk'),
    ),
  );
}

function streakSection({ streak, bestStreak, history }) {
  const max = Math.max(...history.map((d) => d.score), 1);
  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'streak' },
      h('span', { class: `flame${streak === 0 ? ' off' : ''}` }),
      h('span', {}, streak > 0 ? `${streak}-day streak` : 'No streak'),
      h('small', {}, `Best ${bestStreak}`),
    ),
    h(
      'div',
      { class: 'chart' },
      ...history.map(({ day, score }, i) =>
        h(
          'div',
          { class: `chart-col${i === history.length - 1 ? ' today' : ''}`, title: `${day}: ${score} pts` },
          h(
            'div',
            { class: 'chart-track' },
            h('div', {
              class: `chart-bar${score ? '' : ' empty'}`,
              // Whole pixels (steps of 2) keep the bars crisp.
              style: score ? { height: `${Math.max(4, Math.round((score / max) * (BAR_MAX_PX / 2)) * 2)}px` } : {},
            }),
          ),
          h('span', { class: 'chart-day display' }, weekdayInitial(day)),
        ),
      ),
    ),
  );
}

function sizeSection({ petSize, sizeRange }) {
  const value = h('span', { class: 'value display' }, `${petSize} px`);
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
    const pct = ((slider.value - sizeRange.min) / (sizeRange.max - sizeRange.min)) * 100;
    slider.style.setProperty('--fill', `${pct}%`);
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

  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'label-row display' }, h('span', { class: 'muted' }, 'SIZE'), value),
    slider,
  );
}

const action = (name, label, { disabled, danger, end } = {}) =>
  h(
    'button',
    { class: `action${danger ? ' danger' : ''}`, type: 'button', disabled, onclick: () => api.action(name) },
    label,
    end,
  );

function actionsSection({ status, configured, connected, petVisible, openAtLogin }) {
  const syncing = Boolean(status?.syncing);
  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'actions' },
      configured
        ? [
            action('sync', syncing ? 'Syncing…' : 'Sync now', {
              disabled: syncing,
              end: syncing ? h('span', { class: 'spin display' }, '↻') : null,
            }),
            action('togglePet', petVisible ? 'Hide pet' : 'Show pet'),
          ]
        : [],
      action('openSettings', 'Repos & pet settings…'),
      action('toggleOpenAtLogin', 'Open at login', {
        end: h('input', { class: 'check', type: 'checkbox', checked: openAtLogin, tabIndex: -1 }),
      }),
      connected ? action('disconnect', 'Disconnect & reset', { danger: true }) : null,
      action('quit', 'Quit Gitgotchi'),
    ),
  );
}

// ---------- Render ----------

function render(state) {
  if (dragging) return; // the slider owns the screen until released
  const { status, configured } = state;
  app.replaceChildren(
    ...(configured && status
      ? [header(status), streakSection(status), sizeSection(state)]
      : [
          h(
            'section',
            { class: 'section' },
            h('h1', { class: 'title display' }, 'GITGOTCHI'),
            h('p', { class: 'welcome' }, 'No pet yet. Pick your repos to hatch one.'),
          ),
        ]),
    actionsSection(state),
    ...(status?.error ? [h('p', { class: 'error', role: 'alert' }, status.error)] : []),
  );
}

// ---------- Boot ----------

// The window height follows the content.
new ResizeObserver(() => api.setHeight(Math.ceil(app.getBoundingClientRect().height))).observe(app);

api.onState(render);
api.state().then(render);
