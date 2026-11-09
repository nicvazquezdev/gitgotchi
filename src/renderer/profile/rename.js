// The name of a pet with a pencil to change it, in place: the name becomes a field with a check and a cross.
// Only the Pets view uses it, so the state is the module's.
import { h } from '../shared/dom.js';
import { icon } from '../shared/ui.js';

let editing = null; // species id of the pet whose name is being edited
let draft = ''; // what was typed

export const stopRenaming = () => {
  editing = null;
  draft = '';
};

/**
 * @param {{ entry: { id: string, name: string }, nameMax: number, headingClass: string,
 *           rename: (name: string) => Promise<boolean>, rerender: (options?: { focus?: string }) => void }} options
 *   `rename` asks the main process and says whether it worked (the caller shows what went wrong).
 */
export function nameLine({ entry, nameMax, headingClass, rename, rerender }) {
  const done = (focus) => {
    stopRenaming();
    rerender({ focus });
  };
  if (editing === entry.id) {
    const save = async () => {
      const name = draft.trim();
      if (name !== entry.name && !(await rename(name))) return;
      done('rename');
    };
    return h(
      'div',
      { class: 'name-line editing' },
      h('input', {
        class: 'name-input',
        value: draft || entry.name,
        maxLength: nameMax,
        autocomplete: 'off',
        spellcheck: false,
        'aria-label': 'Name',
        dataset: { key: 'name' },
        oninput: (e) => (draft = e.target.value),
        onkeydown: (e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') {
            e.stopPropagation(); // it cancels the name, not the page behind
            done('rename');
          }
        },
      }),
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'Save name', title: 'Save', onclick: save },
        icon('check', { size: 16, stroke: 2.6 }),
      ),
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'Cancel', title: 'Cancel', onclick: () => done('rename') },
        icon('x', { size: 16, stroke: 2.4 }),
      ),
    );
  }
  return h(
    'div',
    { class: 'name-line' },
    h('div', { class: `pixel-name ${headingClass}` }, entry.name),
    h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': `Rename ${entry.name}`,
        title: 'Rename',
        dataset: { key: 'rename' },
        onclick: () => {
          editing = entry.id;
          draft = entry.name;
          rerender({ focus: 'name' });
        },
      },
      icon('pencil', { size: 15, stroke: 2.2 }),
    ),
  );
}
