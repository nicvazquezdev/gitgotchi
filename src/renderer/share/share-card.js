// Share: a card with the pet, its level and the trophies, to copy as an image and show off.
// It has nothing else on it: no repos, no PR titles, no username.
import { h } from '../shared/dom.js';
import { spriteImg, xpBar } from '../shared/ui.js';
import { cup, digits } from '../shared/pixel-art.js';

const PORTRAIT_PX = 108; // the biggest the sprite gets on the card (a whole multiple of its size)

/** How big to draw a figure so it fits its box: the longer the text, the smaller the pixels. */
export const digitScale = (value) => (value.length <= 4 ? 4 : value.length === 5 ? 3 : 2);

/** The three figures of the card: what the person has built, as text for the bitmap font. */
export function cardStats({ collection, achievements, streak }) {
  return [
    { label: 'Pets', value: `${collection.hatched}/${collection.total}` },
    { label: 'Achievements', value: `${achievements.unlocked}/${achievements.total}` },
    { label: 'Day streak', value: String(streak) },
  ];
}

/**
 * What gets copied: the card with a flat margin around it (its corners are cut, and in the image they must show a
 * plain color, not whatever is behind the dialog). A fixed width, so it looks the same wherever it is pasted.
 */
export function shareCard(status) {
  const { name, species, stage, level, levelXp, levelXpNeeded, achievements } = status;
  const creature = species.stages[stage.index];
  const scale = Math.max(1, Math.floor(PORTRAIT_PX / creature.size));
  return h(
    'div',
    { class: 'share-shot', id: 'share-card' },
    h(
      'div',
      { class: 'share-card pixel-cut' },
      h(
        'div',
        { class: 'share-in pixel-cut' },
        h(
          'div',
          { class: 'share-top' },
          h(
            'div',
            { class: 'share-portrait portrait pixel-cut' },
            h('div', { class: 'inner pixel-cut' }, spriteImg(creature.file, creature.size, scale, creature.name)),
          ),
          h(
            'div',
            { class: 'share-id' },
            h('div', { class: 'share-name pixel-name' }, name),
            h('div', { class: 'share-sub' }, `${creature.name} · ${stage.name} · Level ${level}`),
            xpBar(levelXp / levelXpNeeded, 'lg'),
            h('div', { class: 'share-xp' }, `${levelXp} / ${levelXpNeeded} XP`),
          ),
          h('div', { class: 'share-mark' }, 'Gitgotchi'),
        ),
        h(
          'div',
          { class: 'share-stats' },
          cardStats(status).map(({ label, value }) =>
            h(
              'div',
              { class: 'share-stat' },
              h(
                'div',
                { class: 'share-digits', role: 'img', ariaLabel: `${label}: ${value}` },
                digits(value, digitScale(value)),
              ),
              h('div', { class: 'share-label' }, label),
            ),
          ),
        ),
        h(
          'div',
          { class: 'share-cups' },
          achievements.tiers.map((tier) =>
            h(
              'div',
              {
                class: `share-cup tier-${tier.id}${tier.unlocked ? '' : ' none'}`,
                title: `${tier.name}: ${tier.unlocked}`,
              },
              cup(2),
              h('b', {}, tier.unlocked),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * The content of the window: the card as it will look, and a button that copies it.
 * @param {{ status: object, copy: (card: HTMLElement) => Promise<{ ok?: boolean }> }} options
 *   `copy` copies the card on screen (the page asks main to capture its rectangle)
 */
export function shareView({ status, copy }) {
  const card = shareCard(status);
  let timer = null;
  const note = h(
    'p',
    { class: 'share-note', role: 'status' },
    'The card is an image with your pet, level and trophies. Nothing else.',
  );
  const button = h(
    'button',
    {
      class: 'btn primary sm pixel-cut',
      type: 'button',
      id: 'share-copy',
      onclick: async () => {
        button.disabled = true;
        const result = await copy(card).catch(() => null);
        button.disabled = false;
        button.textContent = result?.ok ? 'Copied ✓' : 'Could not copy';
        note.textContent = result?.ok
          ? 'Copied. Paste it in a chat, a post or a document.'
          : 'Something went wrong. Try again.';
        clearTimeout(timer);
        timer = setTimeout(() => (button.textContent = 'Copy image'), 2500);
      },
    },
    'Copy image',
  );
  return h('div', { class: 'share-panel' }, card, button, note);
}
