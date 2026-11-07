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

/** Why the pet feels the way it does. Only anxious and happy have a reason; neutral has nothing to explain. */
function moodNotice({ name, mood, moodLabel, moodReason }) {
  if (!moodReason) return null;
  const text = h(
    'span',
    {},
    h('strong', {}, `${name} is ${moodLabel.toLowerCase()}`),
    h('span', { class: 'notice-sub' }, moodReason),
  );
  return mood === 'anxious'
    ? h('div', { class: 'notice' }, icon('clock'), text)
    : h('div', { class: 'notice calm' }, text);
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
    moodNotice(status),
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

const sizeLimit = (sizes, i) =>
  sizes[i].maxLines === null ? `Over ${sizes[i - 1].maxLines} lines` : `Up to ${sizes[i].maxLines} lines`;

function rulesCard({ sizes, review, merged }) {
  const row = (label, xp, lead) =>
    h('div', { class: 'rule' }, lead ?? null, h('span', { class: 'rule-label' }, label), h('b', {}, `+${xp} XP`));
  return h(
    'section',
    { class: 'card rules' },
    h('h2', {}, 'How you earn XP'),
    h(
      'div',
      { class: 'rule-list' },
      h('div', { class: 'rule-group' }, 'Open a PR, by size'),
      sizes.map(({ id, xp }, i) => row(sizeLimit(sizes, i), xp, h('span', { class: 'size-badge' }, id))),
      h('hr'),
      row('Review a PR', review),
      row('Get a PR merged', merged),
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
