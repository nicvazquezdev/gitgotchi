// Building blocks shared by the steps.
import { h } from '../../shared/dom.js';
import { icon, spriteImg } from '../../shared/ui.js';

/** How many steps the flow has: someone who already has pets does not pick one again (their collection is for that). */
export const stepCount = (state) => (state.existingPet ? 2 : 3);

/** "STEP n OF m" with the segmented progress. */
export const stepProgress = (n, total = 3) =>
  h(
    'div',
    { class: 'step-progress' },
    h('span', { class: 'eyebrow' }, `Step ${n} of ${total}`),
    h(
      'div',
      { class: 'segments', 'aria-hidden': 'true' },
      Array.from({ length: total }, (_, i) => h('i', { class: i < n ? 'on' : '' })),
    ),
  );

/** A creature standing on its own shadow, feet on the bottom edge of the box. */
export function creature(stage, scale, alt = '') {
  const feetGap = (stage.size - stage.shadowEllipse.cy) * scale; // sprite pixels below the feet
  return h(
    'div',
    { class: 'creature', style: { marginBottom: `${-feetGap}px` } },
    spriteImg(stage.shadow, stage.size, scale),
    spriteImg(stage.file, stage.size, scale, alt),
  );
}

/** Left panel: a sunset with three baby creatures standing on the grid, and a tagline. */
export function illustration({ species, tagline }) {
  const scales = [3, 4, 3];
  return h(
    'aside',
    { class: 'illustration night' },
    h('div', { class: 'stars', ariaHidden: 'true' }),
    h(
      'div',
      { class: 'ridges', ariaHidden: 'true' },
      h('div', { class: 'ridge left' }),
      h('div', { class: 'ridge right' }),
    ),
    h(
      'div',
      { class: 'trio' },
      species.map((s, i) => creature(s.stages[0], scales[i], s.stages[0].name)),
    ),
    h('p', { class: 'tagline' }, tagline),
  );
}

/** Card with a round icon, a title, a line of text and an optional action on the right. */
export function statusCard({ tone = 'neutral', title, text, action }) {
  const glyph = { success: icon('check', { stroke: 3 }), neutral: icon('clock'), warning: '!' }[tone];
  return h(
    'div',
    { class: 'status-card' },
    h('span', { class: `status-icon ${tone}` }, glyph),
    h('span', { class: 'status-text' }, h('strong', {}, title), text && h('span', {}, text)),
    action,
  );
}

export const button = (label, props = {}, { primary = false, large = false } = {}) =>
  h('button', { class: `btn pixel-cut${primary ? ' primary' : ''}${large ? ' lg' : ''}`, ...props }, label);
