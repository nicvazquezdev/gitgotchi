// Building blocks shared by the three steps.
import { h } from '../../shared/dom.js';
import { icon, spriteImg } from '../../shared/ui.js';

/** "STEP n OF 3" with the segmented progress. */
export const stepProgress = (n) =>
  h(
    'div',
    { class: 'step-progress' },
    h('span', { class: 'eyebrow' }, `Step ${n} of 3`),
    h(
      'div',
      { class: 'segments', 'aria-hidden': 'true' },
      [1, 2, 3].map((i) => h('i', { class: i <= n ? 'on' : '' })),
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

/** Left panel: three baby creatures on a tint, with a tagline. */
export function illustration({ species, tone, tagline }) {
  const scales = [3, 4, 3];
  return h(
    'aside',
    { class: `illustration ${tone}` },
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
