// How XP works: the rules of the game, in a sheet that opens on request (they are not worth a card of their own).
import { h } from '../shared/dom.js';

/**
 * @param {object} rules  `catalog.xpRules`
 * @param {{ close: () => void }} options
 */
export function xpSheet(rules, { close }) {
  const { sizes, review, fastReview, merged, issue, commit, commitsPerDay } = rules;
  const rule = (name, hint, figure) =>
    h(
      'div',
      { class: 'rule' },
      h('div', {}, h('b', {}, name), hint ? h('span', { class: 'meta' }, hint) : null),
      h('b', { class: 'xp-text' }, `+${figure}`, h('span', { class: 'unit' }, 'XP')),
    );
  const low = Math.min(...sizes.map((s) => s.xp));
  const high = Math.max(...sizes.map((s) => s.xp));
  return h(
    'div',
    {
      class: 'sheet-overlay',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': 'How XP works',
      onclick: (e) => e.target === e.currentTarget && close(),
    },
    h(
      'div',
      { class: 'sheet-wrap' },
      h(
        'div',
        { class: 'sheet' },
        h('h2', { class: 'pixel-name' }, 'How XP works'),
        h('p', { class: 'lead' }, 'Your pet grows with what you already do on GitHub.'),
        rule('Open a PR', `By size: ${sizes.map((s) => `${s.name} ${s.xp}`).join(' · ')}`, `${low}–${high}`),
        rule('Review a PR', fastReview != null ? `+${fastReview} more if you answer within an hour` : null, review),
        rule('Get a PR merged', null, merged),
        issue != null && rule('Open an issue', null, issue),
        commit != null && rule('Push a commit', `Up to ${commitsPerDay} a day`, commit),
        h('p', { class: 'meta fine' }, 'Levels follow your own pace, so everyone evolves at a similar speed.'),
        h('button', { class: 'btn primary block', id: 'sheet-close', type: 'button', onclick: close }, 'Got it'),
      ),
    ),
  );
}
