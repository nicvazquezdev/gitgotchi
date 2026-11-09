// Step 3: pick the first pet (and its name), then start. Later ones are hatched from the Pets view of the pet page.
import { h } from '../../shared/dom.js';
import { spriteImg } from '../../shared/ui.js';
import { button, hero, stepProgress } from './parts.js';

const NAME_MAX = 16;

export function createPetStep({ api, catalog, state, go, toast }) {
  const speciesById = (id) => catalog.species.find((s) => s.id === id);
  const babyName = (species) => species.stages[0].name;
  const trio = ['jelly', 'phoenix', 'mushroom'].map(speciesById);

  return {
    render() {
      if (!speciesById(state.species)) state.species = catalog.species[0].id;
      let nameTouched = Boolean(state.name); // a typed (or saved) name survives switching creatures

      const nameInput = h('input', {
        maxLength: NAME_MAX,
        autocomplete: 'off',
        spellcheck: false,
        'aria-label': 'Name your pet',
        oninput: () => {
          nameTouched = true;
          updateStart();
        },
        onkeydown: (e) => e.key === 'Enter' && start(),
      });
      const startBtn = button('', { onclick: start }, { primary: true, large: true });
      const about = h('p', { class: 'pick-about' });

      const cards = catalog.species.map((species) => {
        const baby = species.stages[0];
        return h(
          'button',
          { class: 'pick', type: 'button', role: 'radio', title: species.desc, onclick: () => select(species.id) },
          h(
            'span',
            { class: 'portrait pixel-cut' },
            h('span', { class: 'inner pixel-cut' }, spriteImg(baby.file, baby.size, 2, '')),
          ),
          h('span', { class: 'pixel-name' }, baby.name),
        );
      });

      const currentName = () => nameInput.value.trim() || babyName(speciesById(state.species));
      const updateStart = () => (startBtn.textContent = `Start with ${currentName()}`);

      function select(id) {
        const species = speciesById(id);
        state.species = id;
        if (!nameTouched) nameInput.value = '';
        nameInput.placeholder = babyName(species);
        cards.forEach((c, i) => c.setAttribute('aria-checked', String(catalog.species[i].id === id)));
        about.textContent = `${species.type} type. ${species.desc}`;
        updateStart();
      }

      async function start() {
        startBtn.disabled = true;
        try {
          await api.onboarding.finish({ repos: [...state.selectedRepos], species: state.species, name: currentName() });
          // Main closes this window and shows the pet on the desktop.
        } catch (err) {
          toast(err);
          startBtn.disabled = false;
        }
      }

      nameInput.value = state.name;
      select(state.species);

      return h(
        'div',
        { class: 'ob' },
        hero(trio),
        h(
          'div',
          { class: 'ob-body' },
          stepProgress(3),
          h('h1', { class: 'pixel-title' }, 'Choose your pet'),
          h(
            'p',
            { class: 'lead' },
            'Every pet starts as a baby and evolves three times. You can hatch the others later.',
          ),
          h('div', { class: 'picker', role: 'radiogroup', 'aria-label': 'Pet' }, cards),
          about,
          h('div', { class: 'name-field' }, h('label', { class: 'field' }, nameInput), startBtn),
          h(
            'p',
            { class: 'footnote' },
            'Its evolutions stay a secret until you unlock them. ',
            button('Back', { class: 'link', onclick: () => go('repos') }),
          ),
        ),
      );
    },
  };
}
