// Building blocks shared by the steps.
import { h } from '../../shared/dom.js';
import { icon, spriteImg } from '../../shared/ui.js';

/** How many steps the flow has: someone who already has pets does not pick one again (their collection is for that). */
export const stepCount = (state) => (state.existingPet ? 2 : 3);

/** Little squares: the step you are on and the ones to go. */
export const stepProgress = (n, total = 3) =>
  h(
    'div',
    { class: 'steps', role: 'img', 'aria-label': `Step ${n} of ${total}` },
    Array.from({ length: total }, (_, i) => h('i', { class: i < n ? 'on' : '' })),
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

/** The top of every step: a night with three baby creatures standing on the grid. */
export const hero = (species) =>
  h(
    'header',
    { class: 'ob-hero night' },
    species.map((s) => creature(s.stages[0], 3, s.stages[0].name)),
  );

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
