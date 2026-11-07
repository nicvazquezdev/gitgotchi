// Step 3: pick species and name, then adopt.
import { $, h } from '../../shared/dom.js';
import { animatePet } from '../../shared/sprite.js';

export function createPetStep({ api, catalog, state, toast }) {
  const grid = $('#species-grid');
  const nameInput = $('#pet-name');
  const adoptBtn = $('#btn-adopt');
  const speciesById = (id) => catalog.species.find((s) => s.id === id);

  // Species cards (built once; the animation reads live state).
  const cards = catalog.species.map((species) => {
    const canvas = h('canvas');
    const card = h(
      'button',
      {
        class: 'species-card pixel-border',
        role: 'radio',
        dataset: { id: species.id },
        onclick: () => select(species.id),
      },
      canvas,
      h('span', { class: 'name' }, species.name),
      h('span', { class: 'blurb' }, species.blurb),
    );
    animatePet(canvas, () => ({
      species,
      stageIndex: 1,
      mood: state.species === species.id ? 'happy' : 'idle',
    }));
    return card;
  });
  grid.replaceChildren(...cards);

  // Evolution line of the selected species.
  const evolution = $('#evolution-line');
  evolution.replaceChildren(
    ...catalog.stages.flatMap((stage, i) => {
      const canvas = h('canvas');
      animatePet(canvas, () => ({ species: speciesById(state.species), stageIndex: i, mood: 'idle', progress: 0 }));
      const item = h('div', { class: 'evo-stage' }, canvas, stage.name);
      return i === 0 ? [item] : [h('span', { class: 'evo-arrow' }, '▸'), item];
    }),
  );

  function select(id) {
    const prev = speciesById(state.species);
    // If the name was the previous species' default, switch to the new default.
    if (!nameInput.value.trim() || nameInput.value === prev?.name) nameInput.value = speciesById(id).name;
    state.species = id;
    cards.forEach((c) => c.setAttribute('aria-checked', String(c.dataset.id === id)));
    $('#species-warning').hidden = !state.existingPet || state.existingPet.species === id;
  }

  async function adopt() {
    adoptBtn.disabled = true;
    try {
      await api.onboarding.finish({
        repos: [...state.selectedRepos],
        species: state.species,
        name: nameInput.value.trim(),
      });
      // Main closes this window and shows the pet on the desktop.
    } catch (err) {
      toast(err);
      adoptBtn.disabled = false;
    }
  }

  adoptBtn.addEventListener('click', adopt);
  nameInput.addEventListener('keydown', (e) => e.key === 'Enter' && adopt());

  return {
    enter() {
      nameInput.value ||= state.name || speciesById(state.species).name;
      select(state.species);
    },
  };
}
