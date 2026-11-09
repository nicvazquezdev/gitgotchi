// Arrow-key movement in a grid of cards (pure): the pets, the trophies.

/**
 * Where the arrow keys go: `index` of `count` cards, `columns` wide. Stops at the edges, Home and End jump, and any
 * other key leaves the same card.
 */
export function gridMove(index, key, count, columns) {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key];
  const next = index + (step ?? 0);
  return step === undefined || next < 0 || next >= count ? index : next;
}
