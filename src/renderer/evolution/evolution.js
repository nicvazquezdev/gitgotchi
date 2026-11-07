// Evolution celebration: shown when the pet reaches a new stage.
import { $, h } from '../shared/dom.js';
import { icon, spriteImg } from '../shared/ui.js';

const api = window.gitgotchi;

const HERO_PX = 180; // target size of the new sprite (rounded to an integer scale)
const STARS = [
  [96, 88],
  [212, 420],
  [820, 120],
  [760, 470],
  [150, 250, 'dim'],
  [880, 300, 'dim'],
  [60, 540, 'dim'],
  [900, 560, 'dim'],
];
const GLINTS = [
  [352, 192, 12, '#ffd36a'],
  [600, 170, 16, '#ffffff'],
  [610, 352, 12, '#ffd36a'],
  [330, 350, 8, '#ffffff'],
];
const GLOWS = [
  [330, 140, 300, 'var(--glow-1)'],
  [370, 180, 220, 'var(--glow-2)'],
  [405, 215, 150, 'var(--glow-3)'],
];

const at = (x, y) => ({ left: `${x}px`, top: `${y}px` });

function pill(species, index, text, cls = '') {
  const stage = species.stages[index];
  return h('span', { class: `pill ${cls}` }, spriteImg(stage.file, 24, 1), text);
}

function render({ status, catalog, fromIndex, toIndex }) {
  const { species, name } = status;
  const to = species.stages[toIndex];
  const from = species.stages[fromIndex];
  const toInfo = catalog.stages[toIndex];
  const next = catalog.stages[toIndex + 1];
  const { hatched, total } = status.collection;
  const decor = [
    ...STARS.map(([x, y, dim]) => h('div', { class: `star ${dim ?? ''}`, style: at(x, y), ariaHidden: 'true' })),
    ...GLOWS.map(([x, y, size, color]) =>
      h('div', {
        class: 'circle',
        ariaHidden: 'true',
        style: { ...at(x, y), width: `${size}px`, height: `${size}px`, background: color },
      }),
    ),
    ...GLINTS.map(([x, y, size, color]) => {
      const glint = h('div', { class: 'glint', ariaHidden: 'true', style: at(x, y) });
      glint.style.setProperty('--s', `${size}px`);
      glint.style.setProperty('--c', color);
      return glint;
    }),
  ];
  $('#app').replaceChildren(
    ...decor,
    h(
      'div',
      { class: 'head' },
      h('div', { class: 'eyebrow' }, 'EVOLUTION'),
      h('h1', {}, `${name} evolved into ${to.name}!`),
    ),
    h('div', { class: 'floor-shadow', ariaHidden: 'true' }),
    h('div', { class: 'hero' }, spriteImg(to.file, to.size, Math.max(1, Math.round(HERO_PX / to.size)), to.name)),
    h(
      'div',
      { class: 'pills' },
      pill(species, fromIndex, `${from.name} · ${catalog.stages[fromIndex].name}`),
      icon('arrow', { size: 16, stroke: 2.5 }),
      pill(species, toIndex, `${to.name} · ${toInfo.name} · Level ${toInfo.level}`, 'to'),
    ),
    h(
      'p',
      { class: 'hint' },
      next
        ? `Keep shipping. ${to.name}’s next form unlocks at level ${next.level}.`
        : hatched < total
          ? `${to.name} is fully grown! Hatch another companion to keep collecting: ${hatched} of ${total} so far.`
          : `${to.name} is fully grown, and your collection is complete. Keep shipping!`,
    ),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn primary pixel-cut', onclick: () => api.evolution.close() }, 'Awesome!'),
      next || hatched === total
        ? h('button', { class: 'btn pixel-cut', onclick: () => api.evolution.viewProfile() }, 'View profile')
        : h(
            'button',
            { class: 'btn pixel-cut', onclick: () => api.evolution.viewProfile('collection') },
            'Choose the next companion',
          ),
    ),
  );
}

async function init() {
  const [boot, evolution] = await Promise.all([api.bootstrap(), api.evolution.data()]);
  render({ ...evolution, status: boot.status, catalog: boot.catalog });
}

init();
