// Step 3: pick a creature line and a name, then adopt.
import { $, h } from '../../shared/dom.js';
import { animatePet } from '../../shared/sprite.js';

const THUMB_SCALE = 2; // sprites are drawn at whole multiples of their native size

export function createPetStep({ api, catalog, state, toast }) {
  const nameInput = $('#pet-name');
  const adoptBtn = $('#btn-adopt');
  const speciesById = (id) => catalog.species.find((s) => s.id === id);
  const selected = () => speciesById(state.species);
  const defaultName = (species) => species.stages[0].name;
  const sized = (canvas, nativeSize) =>
    Object.assign(canvas.style, { width: `${nativeSize * THUMB_SCALE}px`, height: `${nativeSize * THUMB_SCALE}px` });

  // Picker: the baby of every line (built once; the animation reads live state).
  const cards = catalog.species.map((species) => {
    const canvas = h('canvas');
    sized(canvas, species.stages[0].size);
    animatePet(canvas, () => ({ species, stageIndex: 0, mood: state.species === species.id ? 'happy' : 'idle' }), {
      fit: 'sprite',
    });
    return h(
      'button',
      {
        class: 'species-card pixel-border',
        role: 'radio',
        title: species.blurb,
        dataset: { id: species.id },
        onclick: () => select(species.id),
      },
      canvas,
      h('span', { class: 'name' }, species.name),
    );
  });
  $('#species-grid').replaceChildren(...cards);

  // Evolution line of the selected species: same native sizes for every line, names change.
  const evoNames = [];
  $('#evolution-line').replaceChildren(
    ...catalog.stages.flatMap((stage, i) => {
      const canvas = h('canvas');
      sized(canvas, catalog.species[0].stages[i].size);
      animatePet(canvas, () => ({ species: selected(), stageIndex: i, mood: 'idle' }), { fit: 'sprite' });
      const name = h('span', { class: 'evo-name' });
      evoNames.push(name);
      const item = h('div', { class: 'evo-stage', title: stage.name }, canvas, name, h('small', {}, stage.name));
      return i === 0 ? [item] : [h('span', { class: 'evo-arrow' }, '▸'), item];
    }),
  );

  function select(id) {
    const prev = selected();
    const next = speciesById(id);
    // Keep a custom name; replace the previous line's default.
    if (!nameInput.value.trim() || nameInput.value === (prev && defaultName(prev))) nameInput.value = defaultName(next);
    state.species = id;
    cards.forEach((c) => c.setAttribute('aria-checked', String(c.dataset.id === id)));
    $('#species-name').textContent = next.name;
    $('#species-blurb').textContent = next.blurb;
    next.stages.forEach((s, i) => (evoNames[i].textContent = s.name));
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
      if (!speciesById(state.species)) state.species = catalog.species[0].id;
      nameInput.value ||= state.name || defaultName(selected());
      select(state.species);
    },
  };
}
