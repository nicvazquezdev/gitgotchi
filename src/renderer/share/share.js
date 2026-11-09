// Share window: the card of the active pet, to copy as an image. It follows the status (a level, a trophy) while open.
import { $ } from '../shared/dom.js';
import { shareView } from './share-card.js';

const api = window.gitgotchi.share;

/** Asks main to copy the card on screen (its rectangle) to the clipboard as an image. */
function copyCard(card) {
  const { x, y, width, height } = card.getBoundingClientRect();
  return api.copyCard({ x, y, width, height });
}

const render = (status) => $('#app').replaceChildren(shareView({ status, copy: copyCard }));

api.onStatus(render);
render(await api.status());
