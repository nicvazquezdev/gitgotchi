// Profile window. Two views, switched in the title bar: the overview (pet card, evolution line, this week's
// activity and the XP rules) and the achievements.
import { $, h } from '../shared/dom.js';
import { icon, spriteImg, xpBar } from '../shared/ui.js';
import { plural } from '../shared/format.js';
import { animatePet } from '../shared/sprite.js';
import { achievementsPage } from './achievements-view.js';

const api = window.gitgotchi;
let catalog = null;
let stopAnimation = () => {};

const PORTRAIT_MAX = 150; // px: biggest sprite in the portrait (integer scale of its native size)
const portraitScale = (size) => Math.max(2, Math.floor(PORTRAIT_MAX / size));

function portrait({ species, stage, mood }) {
  const size = species.stages[stage.index].size;
  const canvas = h('canvas', { class: 'sprite', style: { width: `${size * portraitScale(size)}px` } });
  stopAnimation();
  stopAnimation = animatePet(canvas, () => ({ species, stageIndex: stage.index, mood }), { fit: 'sprite' });
  return h(
    'div',
    { class: 'portrait pixel-cut' },
    h('div', { class: 'inner pixel-cut' }, h('div', { class: 'floor', ariaHidden: 'true' }), canvas),
  );
}

const MOOD_VIEW = {
  happy: { icon: 'smile', fallback: 'Things are going well' },
  neutral: { icon: 'neutral', fallback: 'Nothing needs your attention' },
  anxious: { icon: 'alert', fallback: 'A PR needs a review' },
};

/** How the pet feels and why: a tinted card per mood (green happy, amber anxious, quiet neutral). */
function moodCard({ name, mood, moodLabel, moodReason }) {
  const view = MOOD_VIEW[mood] ?? MOOD_VIEW.neutral;
  return h(
    'div',
    { class: `mood ${mood}` },
    h('div', { class: 'mood-icon' }, icon(view.icon, { size: 20, stroke: 2.2 })),
    h(
      'div',
      { class: 'mood-text' },
      h('div', { class: 'mood-title' }, `${name} is ${moodLabel.toLowerCase()}`),
      h('div', { class: 'mood-sub' }, moodReason ?? view.fallback),
    ),
  );
}

const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });

/** Current streak plus the XP of each of the last 7 days as bars. */
function activityBlock({ streak, bestStreak, history }) {
  const top = Math.max(1, ...history.map((d) => d.score));
  const title = streak > 0 ? `${streak}-day streak` : 'No streak yet';
  const hint =
    streak > 0 ? `best ${bestStreak}` : bestStreak > 0 ? `best ${plural(bestStreak, 'day')}` : 'ship something today';
  return h(
    'div',
    { class: 'activity' },
    h(
      'div',
      { class: 'activity-head', title: 'Days in a row with activity. Weekends never break a streak.' },
      h('b', {}, title),
      h('span', { class: 'meta' }, hint),
    ),
    h(
      'div',
      { class: 'bars', role: 'img', 'aria-label': `XP per day, last 7 days` },
      history.map(({ day, score }, i) =>
        h(
          'div',
          { class: `bar-col${i === history.length - 1 ? ' today' : ''}`, title: `${weekday(day)}: +${score} XP` },
          h(
            'div',
            { class: 'bar-track' },
            h('div', {
              class: `bar${score ? '' : ' empty'}`,
              style: { height: `${score ? Math.max(8, (score / top) * 100) : 0}%` },
            }),
          ),
          h('span', { class: 'bar-day' }, weekday(day)),
        ),
      ),
    ),
  );
}

function petCard(status) {
  const { name, level, levelXp, levelXpNeeded, stage, species } = status;
  const creatureName = species.stages[stage.index].name;
  return h(
    'section',
    { class: 'card pet-card' },
    portrait(status),
    h('div', { class: 'pixel-name pet-name' }, name),
    h('div', { class: 'pet-sub' }, `${creatureName} · ${stage.name} · Level ${level}`),
    xpBar(levelXp / levelXpNeeded, 'lg'),
    h(
      'div',
      { class: 'xp-row' },
      h('b', {}, `${levelXp} / ${levelXpNeeded} XP`),
      h('span', { class: 'meta' }, `${levelXpNeeded - levelXp} XP to level ${level + 1}`),
    ),
    activityBlock(status),
    moodCard(status),
  );
}

function stageCard(stage, i, current) {
  const state = i === current ? 'now' : i < current ? 'done' : 'locked';
  const { name, level } = catalog.stages[i];
  const art =
    state === 'locked' ? spriteImg(stage.silhouette, stage.size, 2) : spriteImg(stage.file, stage.size, 2, stage.name);
  return h(
    'div',
    { class: `stage ${state}` },
    h('div', { class: 'stage-art' }, art),
    h(
      'div',
      {},
      h('div', { class: 'pixel-name' }, state === 'locked' ? '???' : stage.name),
      h(
        'div',
        { class: 'stage-label' },
        state === 'now' ? `${name} · now` : state === 'locked' ? `Unlocks at level ${level}` : `${name} · reached`,
      ),
    ),
  );
}

function evolutionCard({ species, stage }) {
  const parts = species.stages.map((s, i) => stageCard(s, i, stage.index));
  const line = parts.flatMap((part, i) => (i ? [icon('chevron', { size: 14, stroke: 2.5 }), part] : [part]));
  return h(
    'section',
    { class: 'card' },
    h(
      'div',
      { class: 'card-head' },
      h('h2', {}, 'Evolution'),
      h('span', { class: 'meta' }, `${species.line} · Stage ${stage.index + 1} of ${species.stages.length}`),
    ),
    h('div', { class: 'stages' }, line),
  );
}

function weekCard({ week }) {
  const line = (count, label, xp) =>
    h(
      'div',
      { class: 'week-line' },
      h('b', { class: 'count' }, count),
      h('span', { class: 'week-label' }, label),
      h('span', { class: 'xp-text' }, `+${xp} XP`),
    );
  return h(
    'section',
    { class: 'card week' },
    h('div', { class: 'card-head' }, h('h2', {}, 'This week'), h('span', { class: 'xp-text' }, `+${week.total} XP`)),
    h(
      'div',
      { class: 'week-lines' },
      line(week.prs, 'PRs opened', week.xp.prs),
      line(week.reviews, 'Reviews', week.xp.reviews),
      line(week.merges, 'PRs merged', week.xp.merges),
      line(week.commits, 'Commits', week.xp.commits),
      line(week.issues, 'Issues', week.xp.issues),
    ),
  );
}

/** "up to 10 lines" / "over 500 lines" */
const sizeLimit = (sizes, i) =>
  sizes[i].maxLines === null ? `over ${sizes[i - 1].maxLines} lines` : `up to ${sizes[i].maxLines} lines`;

function rulesCard({ sizes, review, merged, issue, commit, commitsPerDay }) {
  const rule = (name, hint, xp) =>
    h(
      'div',
      { class: 'rule' },
      h('div', {}, h('b', {}, name), h('div', { class: 'rule-hint' }, hint)),
      h('b', { class: 'xp-pill' }, `+${xp} XP`),
    );
  const sizeRule = ({ name, xp }, i) => rule(name, sizeLimit(sizes, i), xp);
  return h(
    'section',
    { class: 'card rules' },
    h('h2', {}, 'How you earn XP'),
    h(
      'div',
      { class: 'rule-cols' },
      h('div', { class: 'rule-col' }, h('div', { class: 'rule-group' }, 'Open a PR'), sizes.map(sizeRule)),
      h(
        'div',
        { class: 'rule-col' },
        h('div', { class: 'rule-group' }, 'Other activity'),
        rule('Review a PR', 'per review', review),
        rule('PR merged', 'per PR', merged),
        issue != null && rule('Open an issue', 'per issue', issue),
        commit != null && rule('Push a commit', `max ${commitsPerDay} a day`, commit),
      ),
    ),
  );
}

// ---------- Views ----------

const VIEWS = [
  ['overview', 'Overview'],
  ['achievements', 'Achievements'],
];
let view = location.hash === '#achievements' ? 'achievements' : 'overview';
let filter = 'all'; // achievements: which ones to show
let latest = null; // the last status received
let shownView = null; // the view on screen

/** The switch in the title bar. */
function viewTabs(status) {
  const { unlocked, total } = status.achievements;
  const select = (next) => {
    view = next;
    render(latest);
    $(`#tab-${next}`)?.focus();
  };
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const at = VIEWS.findIndex(([id]) => id === view);
    select(VIEWS[(at + step + VIEWS.length) % VIEWS.length][0]);
  };
  return h(
    'div',
    { class: 'seg', role: 'tablist', 'aria-label': 'Profile', onkeydown: onKey },
    VIEWS.map(([id, label]) =>
      h(
        'button',
        {
          id: `tab-${id}`,
          class: 'seg-btn',
          type: 'button',
          role: 'tab',
          'aria-selected': String(id === view),
          tabIndex: id === view ? 0 : -1,
          onclick: () => select(id),
        },
        label,
        id === 'achievements' ? h('span', { class: 'count-chip' }, `${unlocked}/${total}`) : null,
      ),
    ),
  );
}

function render(status) {
  latest = status;
  const app = $('#app');
  const switched = shownView !== view;
  const scroll = switched ? 0 : app.scrollTop; // a status update keeps the place in the list
  shownView = view;
  $('#title').replaceChildren(viewTabs(status));
  app.className = `content ${view}`;
  app.style.setProperty('--tint', status.species.tint);
  if (view === 'achievements') {
    stopAnimation(); // the pet card is not on screen
    app.replaceChildren(
      achievementsPage(status, {
        filter,
        enter: switched,
        onFilter: (next) => {
          filter = next;
          render(latest);
        },
      }),
    );
  } else {
    app.replaceChildren(
      petCard(status),
      h(
        'div',
        { class: 'right' },
        evolutionCard(status),
        h('div', { class: 'row' }, weekCard(status), rulesCard(catalog.xpRules)),
      ),
    );
  }
  app.scrollTop = scroll;
}

async function init() {
  const boot = await api.bootstrap();
  catalog = boot.catalog;
  api.profile.onStatus(render);
  render(boot.status ?? (await api.profile.status()));
}

init();
