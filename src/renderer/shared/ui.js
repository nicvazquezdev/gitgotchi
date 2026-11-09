// Small shared UI builders for the app design (use with tokens.css + components.css).
import { h } from './dom.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ASSETS = new URL('../../../assets/pets/', import.meta.url);

// Stroke icons from the design (24×24 viewBox), drawn in currentColor.
const ICON_PATHS = {
  check: '<path d="M5 12l4 4 10-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5v.5M15 9.5v.5"/>',
  neutral: '<circle cx="12" cy="12" r="9"/><path d="M9 15h6M9 9.5v.5M15 9.5v.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16v.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  merge: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  share: '<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/>',
  swap: '<path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  hand: '<path d="M9 11V5a2 2 0 0 1 4 0v6M13 10a2 2 0 0 1 4 0v2M17 11a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.5L4 14a2 2 0 0 1 3.5-2L9 14"/>',
};

/** Inline SVG icon (decorative unless `label` is given). */
export function icon(name, { size = 16, stroke = 2 } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': stroke,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    svg.setAttribute(k, v);
  svg.innerHTML = ICON_PATHS[name]; // static, trusted markup
  return svg;
}

/** Segmented XP bar: 20 blocks, `fraction` (0..1) of them filled. */
export function xpBar(fraction, size = '') {
  const on = Math.round(Math.max(0, Math.min(1, fraction)) * 20);
  return h(
    'div',
    { class: `xp-bar ${size}`.trim(), role: 'progressbar', ariaValueNow: Math.round(fraction * 100) },
    Array.from({ length: 20 }, (_, i) => h('i', { class: i < on ? 'on' : '' })),
  );
}

/** A creature PNG at an integer multiple of its native size (crisp pixels). */
export function spriteImg(file, nativeSize, scale, alt = '') {
  return h('img', {
    class: 'sprite',
    src: new URL(file, ASSETS).href,
    alt,
    width: nativeSize * scale,
    height: nativeSize * scale,
  });
}

/** The creature of the current stage for a portrait box: the largest whole-pixel scale that fits `box` px. */
export function portraitImg(status, box = 64) {
  const stage = status.species.stages[status.stage.index];
  return spriteImg(stage.file, stage.size, Math.max(1, Math.floor(box / stage.size)), stage.name);
}
