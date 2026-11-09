// What the card shows under its header: how the pet will grow and how the week went.
import { h } from '../shared/dom.js';
import { icon, spriteImg } from '../shared/ui.js';
import { glyph } from '../shared/pixel-art.js';

const section = (title, body, aside = null) =>
  h(
    'section',
    { class: 'sect' },
    h('div', { class: 'sect-head' }, h('span', { class: 'eyebrow' }, title), aside),
    body,
  );

/** One form: reached, the one it is in (framed), or still hidden (a silhouette and the level that unlocks it). */
function stageTile(stage, i, current, levels) {
  const state = i === current ? 'now' : i < current ? 'done' : 'locked';
  const art =
    state === 'locked'
      ? spriteImg(stage.silhouette, stage.size, 1, '')
      : spriteImg(stage.file, stage.size, 1, stage.name);
  return h(
    'div',
    { class: `stage ${state}` },
    state === 'now'
      ? h('div', { class: 'portrait pixel-cut' }, h('div', { class: 'inner pixel-cut' }, art))
      : h('div', { class: 'night pixel-cut' }, art),
    h(
      'div',
      { class: state === 'locked' ? 'nm dim' : 'nm' },
      state === 'locked' ? `Lv ${levels[i].level}` : stage.name,
    ),
  );
}

/** The line of forms. `levels`: the catalog's stages (the level that unlocks each one). */
export function growth({ species, stage }, levels) {
  const tiles = species.stages.map((s, i) => stageTile(s, i, stage.index, levels));
  const line = tiles.flatMap((tile, i) =>
    i ? [h('span', { class: 'arrow' }, icon('chevron', { size: 16, stroke: 2.5 })), tile] : [tile],
  );
  return section('Growth', h('div', { class: 'growth' }, line));
}

const weekday = (day) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
const BAR_MAX = 44; // px: the tallest day

/** XP the active pet earned on each of the last 7 days as bars, its total for the week and the streak. */
export function week({ weekXp, history, streak }) {
  const top = Math.max(1, ...history.map((d) => d.score));
  return section(
    'This week',
    [
      h(
        'div',
        { class: 'week' },
        history.map(({ day, score }, i) =>
          h(
            'div',
            { class: 'day' },
            h('div', {
              class: `bar${score ? '' : ' none'}${i === history.length - 1 ? ' today' : ''}`,
              style: { height: `${score ? Math.max(6, (score / top) * BAR_MAX) : 4}px` },
            }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'week-days' },
        history.map(({ day }, i) => h('small', { class: i === history.length - 1 ? 'today' : '' }, weekday(day))),
      ),
      h(
        'div',
        { class: 'streak' },
        glyph('flame', 2),
        streak > 0 ? `${streak}-day streak` : 'No streak yet. Ship something today.',
      ),
    ],
    h('span', { class: 'fig' }, `+${weekXp} XP`),
  );
}
