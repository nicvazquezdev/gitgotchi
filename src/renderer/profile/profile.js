// Profile window: pet card, evolution line, this week's activity and the XP rules.
import { $, h } from '../shared/dom.js';
import { icon, spriteImg, xpBar } from '../shared/ui.js';
import { animatePet } from '../shared/sprite.js';

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

function petCard(status) {
  const { name, level, levelXp, levelXpNeeded, stage, species, moodLabel, moodReason } = status;
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
    moodReason
      ? h('div', { class: 'notice' }, icon('clock'), h('span', {}, h('strong', {}, moodLabel), ` · ${moodReason}`))
      : h('div', { class: 'notice calm' }, h('span', {}, h('strong', {}, moodLabel))),
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
      h('div', { class: 'stage-label' }, state === 'now' ? `${name} · now` : `${name} · level ${level}`),
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
  const tile = (count, label, xp) =>
    h(
      'div',
      { class: 'tile' },
      h('div', { class: 'count' }, count),
      h('div', {}, label),
      h('span', { class: 'xp-text' }, `+${xp} XP`),
    );
  return h(
    'section',
    { class: 'card week' },
    h('div', { class: 'card-head' }, h('h2', {}, 'This week'), h('span', { class: 'xp-text' }, `+${week.total} XP`)),
    h(
      'div',
      { class: 'tiles' },
      tile(week.prs, 'PRs opened', week.xp.prs),
      tile(week.reviews, 'Reviews', week.xp.reviews),
      tile(week.merges, 'PRs merged', week.xp.merges),
    ),
  );
}

function rulesCard({ prBySize, review, merged }) {
  const points = Object.values(prBySize);
  const rule = (label, value) => h('div', { class: 'rule' }, h('span', {}, label), h('span', {}, value));
  return h(
    'section',
    { class: 'card rules' },
    h('h2', {}, 'How you earn XP'),
    h(
      'div',
      { class: 'rule-list' },
      rule('Open a PR', `+${Math.min(...points)} to +${Math.max(...points)} by size`),
      h(
        'div',
        { class: 'sizes' },
        Object.entries(prBySize).map(([size, xp]) => h('span', { class: 'size-badge' }, `${size} ${xp}`)),
      ),
      h('hr'),
      rule('Review a PR', `+${review}`),
      rule('Get a PR merged', `+${merged}`),
    ),
  );
}

function render(status) {
  $('#title').textContent = status.name;
  const app = $('#app');
  app.style.setProperty('--tint', status.species.tint);
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

async function init() {
  const boot = await api.bootstrap();
  catalog = boot.catalog;
  api.profile.onStatus(render);
  render(boot.status ?? (await api.profile.status()));
}

init();
