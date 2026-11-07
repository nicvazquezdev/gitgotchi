// Step 3: pick the first companion (and its name), then start. Later ones are hatched from the collection.
import { h } from '../../shared/dom.js';
import { spriteImg } from '../../shared/ui.js';
import { button, stepProgress } from './parts.js';

const NAME_MAX = 16;

export function createPetStep({ api, catalog, state, go, toast }) {
  const speciesById = (id) => catalog.species.find((s) => s.id === id);
  const babyName = (species) => species.stages[0].name;

  return {
    render() {
      if (!speciesById(state.species)) state.species = catalog.species[0].id;
      let cloudSync = false;
      let nameTouched = Boolean(state.name); // a typed (or saved) name survives switching creatures

      const nameInput = h('input', {
        maxLength: NAME_MAX,
        autocomplete: 'off',
        spellcheck: false,
        'aria-label': 'Name your companion',
        oninput: () => {
          nameTouched = true;
          updateStart();
        },
        onkeydown: (e) => e.key === 'Enter' && start(),
      });
      const startBtn = button('', { onclick: start }, { primary: true });
      const detail = h('section', { class: 'detail', 'aria-label': 'Selected companion' });
      const footerText = h('p', { class: 'footer-text' });

      const cards = catalog.species.map((species) => {
        const baby = species.stages[0];
        return h(
          'button',
          { class: 'pick', role: 'radio', title: species.desc, onclick: () => select(species.id) },
          h('span', { class: 'tile', style: { background: species.tint } }, spriteImg(baby.file, baby.size, 3)),
          h('span', { class: 'pixel-name' }, baby.name),
        );
      });

      const currentName = () => nameInput.value.trim() || babyName(speciesById(state.species));
      const updateStart = () => (startBtn.textContent = `Start with ${currentName()}`);

      function renderDetail(species) {
        const [baby, ...hidden] = species.stages;
        // `info` is the generic stage ({ name: 'Kid', level: 5 }); locked stages show a silhouette.
        const tile = (stage, info, locked) =>
          h(
            'div',
            { class: 'evo-stage' },
            h(
              'div',
              { class: `evo-tile${locked ? '' : ' current'}`, style: { background: species.tint } },
              spriteImg(locked ? stage.silhouette : stage.file, stage.size, 2, locked ? 'Hidden evolution' : baby.name),
            ),
            h('div', { class: locked ? 'pixel-name locked' : 'pixel-name' }, locked ? '???' : stage.name),
            locked
              ? h('div', { class: 'meta' }, `${info.name} · Lv ${info.level}`)
              : h('div', { class: 'stage-now' }, info.name),
          );
        detail.replaceChildren(
          h(
            'div',
            { class: 'detail-top' },
            h(
              'div',
              { class: 'portrait pixel-cut', style: { width: '140px', height: '140px' } },
              h(
                'div',
                { class: 'inner', style: { background: species.tint } },
                spriteImg(baby.file, baby.size, 4, baby.name),
              ),
            ),
            h(
              'div',
              {},
              h('div', { class: 'eyebrow' }, `${species.type} · ${species.line}`),
              h('div', { class: 'pixel-name detail-name' }, baby.name),
              h('p', { class: 'desc' }, species.desc),
            ),
          ),
          h(
            'div',
            { class: 'evo-head' },
            h('strong', {}, 'Evolution line'),
            h('span', { class: 'meta' }, 'Revealed as you level up'),
          ),
          h(
            'div',
            { class: 'evo-grid' },
            tile(baby, catalog.stages[0], false),
            hidden.map((s, i) => tile(s, catalog.stages[i + 1], true)),
          ),
        );
      }

      function select(id) {
        const species = speciesById(id);
        state.species = id;
        if (!nameTouched) nameInput.value = '';
        nameInput.placeholder = babyName(species);
        cards.forEach((c, i) => c.setAttribute('aria-checked', String(catalog.species[i].id === id)));
        renderDetail(species);
        footerText.textContent = 'Its evolutions stay a secret until you unlock them.';
        updateStart();
      }

      async function start() {
        startBtn.disabled = true;
        try {
          await api.onboarding.finish({
            repos: [...state.selectedRepos],
            species: state.species,
            name: currentName(),
            cloudSync,
          });
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
        { class: 'pet-step' },
        h(
          'header',
          { class: 'pet-head' },
          h('div', {}, stepProgress(3), h('h1', { class: 'pixel-title small' }, 'Choose your companion')),
          h(
            'p',
            { class: 'muted' },
            'Every companion starts as a baby and evolves three times. You can hatch the others later.',
          ),
        ),
        h(
          'div',
          { class: 'pet-main' },
          h(
            'div',
            { class: 'pet-left' },
            h('div', { class: 'picker', role: 'radiogroup', 'aria-label': 'Companion' }, cards),
            h(
              'div',
              { class: 'pet-options' },
              h('label', { class: 'field' }, h('span', { class: 'meta' }, 'Name'), nameInput),
              h(
                'label',
                { class: 'check-row' },
                h('input', { type: 'checkbox', onchange: (e) => (cloudSync = e.target.checked) }),
                'Back up my pet to a private repo in my GitHub account (sync across computers)',
              ),
            ),
          ),
          detail,
        ),
        h('footer', { class: 'pet-footer' }, footerText, button('Back', { onclick: () => go('repos') }), startBtn),
      );
    },
  };
}
