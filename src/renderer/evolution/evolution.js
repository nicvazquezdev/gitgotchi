// Evolution celebration: shown when the pet reaches a new stage.
import { $, h } from '../shared/dom.js';
import { icon, spriteImg } from '../shared/ui.js';

const api = window.gitgotchi;

const HERO_PX = 180; // target size of the new sprite (rounded to an integer scale)
// [x, y, size, color]: the stars of the sky, and the 4-point glints (bigger, they twinkle in the design)
const STARS = [
  [70, 70, 4, '#ffffff'],
  [190, 150, 2, '#b8f6ff'],
  [300, 96, 3, '#ffb3e1'],
  [676, 84, 3, '#ffffff'],
  [800, 160, 2, '#b8f6ff'],
  [890, 60, 4, '#ffffff'],
  [120, 230, 2, '#ffffff'],
  [860, 236, 2, '#ffb3e1'],
];
const GLINTS = [
  [140, 112, 12, '#ffffff'],
  [780, 110, 12, '#b8f6ff'],
];
// [x, y, width, height, color]: the sun's reflection on the floor, narrowing and shifting colors towards the viewer
const REFLECTIONS = [
  [328, 406, 304, 4, '#ffd23f'],
  [342, 417, 276, 5, '#ffa63a'],
  [361, 432, 238, 6, '#ff6a5c'],
  [380, 451, 200, 7, '#ff3e8a'],
  [399, 476, 162, 8, '#d22fae'],
  [418, 506, 124, 9, '#b02bd6'],
  [437, 544, 86, 10, '#8a2ad0'],
];

const at = (x, y) => ({ left: `${x}px`, top: `${y}px` });
const vars = (el, props) => {
  for (const [name, value] of Object.entries(props)) el.style.setProperty(name, value);
  return el;
};

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
  const sky = [
    ...STARS.map(([x, y, size, color]) =>
      vars(h('div', { class: 'star', style: at(x, y), ariaHidden: 'true' }), { '--s': `${size}px`, '--c': color }),
    ),
    ...GLINTS.map(([x, y, size, color]) =>
      vars(h('div', { class: 'glint', style: at(x, y), ariaHidden: 'true' }), { '--s': `${size}px`, '--c': color }),
    ),
    h('div', { class: 'glow', ariaHidden: 'true' }),
    h('div', { class: 'sun', ariaHidden: 'true' }),
    h(
      'div',
      { class: 'mountains', ariaHidden: 'true' },
      h('div', { class: 'ridge left' }),
      h('div', { class: 'ridge right' }),
    ),
  ];
  const floor = [
    h('div', { class: 'floor grid-floor', ariaHidden: 'true' }),
    ...REFLECTIONS.map(([x, y, width, height, color]) =>
      vars(h('div', { class: 'reflection', ariaHidden: 'true', style: { ...at(x, y), width: `${width}px` } }), {
        '--h': `${height}px`,
        '--c': color,
      }),
    ),
    h('div', { class: 'floor-grid', ariaHidden: 'true' }),
    h('div', { class: 'horizon', ariaHidden: 'true' }),
    h('div', { class: 'scan', ariaHidden: 'true' }),
  ];
  const hint = next
    ? `Keep shipping. ${to.name}’s next form unlocks at level ${next.level}.`
    : hatched < total
      ? `${to.name} is fully grown! Hatch another companion to keep collecting: ${hatched} of ${total} so far.`
      : `${to.name} is fully grown, and your collection is complete. Keep shipping!`;
  $('#app').replaceChildren(
    ...sky,
    ...floor,
    h(
      'div',
      { class: 'head' },
      h('div', { class: 'eyebrow' }, 'EVOLUTION'),
      h('div', { class: 'level' }, `LEVEL ${toInfo.level} REACHED`),
    ),
    h('div', { class: 'floor-shadow', ariaHidden: 'true' }),
    h('div', { class: 'hero' }, spriteImg(to.file, to.size, Math.max(1, Math.round(HERO_PX / to.size)), to.name)),
    h(
      'div',
      { class: 'panel pixel-cut' },
      h(
        'div',
        { class: 'panel-in pixel-cut' },
        h('h1', {}, `${name} evolved into `, h('span', { class: 'grad' }, to.name), '!'),
        h(
          'div',
          { class: 'pills' },
          pill(species, fromIndex, `${from.name} · ${catalog.stages[fromIndex].name}`),
          icon('arrow', { size: 16, stroke: 2.5 }),
          pill(species, toIndex, `${to.name} · ${toInfo.name} · Level ${toInfo.level}`, 'to'),
        ),
        h(
          'div',
          { class: 'next' },
          h('p', { class: 'hint' }, hint),
          h(
            'div',
            { class: 'actions' },
            next || hatched === total
              ? h('button', { class: 'btn pixel-cut', onclick: () => api.evolution.viewProfile() }, 'View profile')
              : h(
                  'button',
                  { class: 'btn pixel-cut', onclick: () => api.evolution.viewProfile('collection') },
                  'Choose the next companion',
                ),
            h('button', { class: 'btn primary pixel-cut', onclick: () => api.evolution.close() }, 'Awesome!'),
          ),
        ),
      ),
    ),
  );
}

async function init() {
  const [boot, evolution] = await Promise.all([api.bootstrap(), api.evolution.data()]);
  render({ ...evolution, status: boot.status, catalog: boot.catalog });
}

init();
