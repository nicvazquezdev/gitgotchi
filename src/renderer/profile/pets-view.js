// Pets: every species as a card (the pet you have, or the silhouette of the one still to hatch), and under them what
// you can do with the selected one: switch to it, rename it, or hatch it with a name. Only the active pet earns XP.
import { h } from '../shared/dom.js';
import { icon, spriteImg } from '../shared/ui.js';
import { glyph } from '../shared/pixel-art.js';
import { gridMove } from './grid.js';
import { nameLine, stopRenaming } from './rename.js';

export const GRID_COLUMNS = 4;

// ---------- What the page remembers between renders (a status arrives every few minutes) ----------

let selected = null; // species id on show; null: the active pet
let picked = false; // the starting pick (from the address) was applied
let busy = false; // a request to the main process is on its way
let problem = null; // what went wrong with the last one
let fresh = null; // species hatched a moment ago
let draft = ''; // what was typed in the name field of a pet to hatch

const forget = () => {
  problem = null;
  draft = '';
  stopRenaming();
};

/** Leaving the page: what was half done is dropped. */
export function leavePets() {
  forget();
  fresh = null;
}

// ---------- The grid ----------

/** One card: the pet that lives there, or the silhouette of the one still to hatch. */
function card(entry, species, { isSelected, onSelect }) {
  const baby = species.stages[0];
  const stage = entry.hatched ? species.stages[entry.stageIndex] : baby;
  const label = entry.hatched
    ? `${entry.name}, level ${entry.level}${entry.active ? ', active' : ''}${entry.mastered ? ', fully grown' : ''}`
    : `${species.type} type, not hatched yet`;
  const classes = ['pet-card', !entry.hatched && 'locked', entry.active && 'active', isSelected && 'sel'];
  return h(
    'button',
    {
      class: classes.filter(Boolean).join(' '),
      type: 'button',
      role: 'option',
      'aria-selected': String(isSelected),
      'aria-label': label,
      tabIndex: isSelected ? 0 : -1,
      dataset: { key: entry.id },
      onclick: () => onSelect(entry.id),
    },
    h(
      'span',
      { class: 'portrait pixel-cut' },
      h(
        'span',
        { class: 'inner pixel-cut' },
        entry.hatched ? spriteImg(stage.file, stage.size, 2, '') : spriteImg(baby.silhouette, baby.size, 2, ''),
      ),
      entry.active ? h('span', { class: 'tile-badge' }, icon('bolt', { size: 11, stroke: 3 }), 'Active') : null,
      entry.mastered ? h('span', { class: 'tile-crown', title: 'Fully grown' }, glyph('crown', 2)) : null,
      entry.hatched ? null : h('span', { class: 'tile-lock' }, icon('lock', { size: 16 })),
    ),
    h('span', { class: 'nm' }, entry.hatched ? entry.name : '???'),
    h(
      'span',
      { class: 'lv' },
      entry.hatched ? `Lv ${entry.level}${entry.mastered ? ' · Fully grown' : ''}` : `${species.type} type`,
    ),
  );
}

// ---------- What can be done with the selected one ----------

function actionBar(entry, species, ctx) {
  const problemLine = problem ? h('p', { class: 'problem', role: 'alert' }, problem) : null;
  if (!entry.hatched) {
    const baby = species.stages[0];
    // The button says who is going to hatch, and follows what is typed.
    const label = h('span', {}, `Hatch ${draft.trim() || baby.name}`);
    const input = h('input', {
      value: draft,
      placeholder: baby.name,
      maxLength: ctx.nameMax,
      autocomplete: 'off',
      spellcheck: false,
      'aria-label': `Name for your ${species.line}`,
      dataset: { key: 'name' },
      oninput: (e) => {
        draft = e.target.value;
        label.textContent = `Hatch ${draft.trim() || baby.name}`;
      },
      onkeydown: (e) => e.key === 'Enter' && ctx.onHatch(entry.id),
    });
    return h(
      'div',
      { class: 'action-bar' },
      h(
        'div',
        { class: 'who' },
        h('b', {}, species.line),
        h('span', { class: 'meta' }, `${species.type} type. ${species.desc}`),
      ),
      h(
        'div',
        { class: 'hatch-row' },
        h('label', { class: 'field' }, input),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            disabled: busy,
            dataset: { key: 'action' },
            onclick: () => ctx.onHatch(entry.id),
          },
          label,
        ),
      ),
      problemLine,
    );
  }
  const earning =
    fresh === entry.id
      ? `Welcome! ${entry.name} earns all new XP now.`
      : `Earning all new XP · +${entry.weekXp} XP this week`;
  return h(
    'div',
    { class: 'action-bar' },
    h(
      'div',
      { class: 'who' },
      nameLine({
        entry,
        nameMax: ctx.nameMax,
        headingClass: 'bar-name',
        rename: ctx.rename,
        rerender: ctx.rerender,
      }),
      h('span', { class: 'meta' }, entry.active ? earning : `${species.type} · Level ${entry.level}`),
    ),
    entry.active
      ? null
      : h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            disabled: busy,
            dataset: { key: 'action' },
            onclick: () => ctx.onActivate(entry.id),
          },
          `Switch to ${entry.name}`,
        ),
    problemLine,
  );
}

// ---------- Page ----------

/**
 * @param {object} status
 * @param {{ catalog: object, api: object, rerender: (options?: { focus?: string }) => void, pick?: string }} options
 *   `pick`: a species to start on (from the address)
 */
export function petsPage(status, { catalog, api, rerender, pick }) {
  const { entries } = status.collection;
  if (pick && !picked) selected = pick;
  picked = true;
  if (!entries.some((e) => e.id === selected)) selected = status.collection.active;
  const entry = entries.find((e) => e.id === selected);
  const speciesOf = (id) => catalog.species.find((s) => s.id === id);

  /** Puts another pet on show and the focus on its card (keyboard users keep their place; a click already has it). */
  const select = (id) => {
    if (id === selected) return;
    selected = id;
    fresh = null;
    forget();
    rerender({ focus: id });
  };
  /**
   * Asks the main process; it answers `{ error, message }` when it cannot (the page says why). The status that follows
   * redraws the page; the focus goes to the card of the pet, or stays on the button when it did not work.
   */
  const ask = async (request) => {
    busy = true;
    problem = null;
    rerender();
    const result = await request();
    busy = false;
    if (result?.error) problem = result.message;
    rerender({ focus: result?.error ? 'action' : selected });
    return !result?.error;
  };
  const ctx = {
    nameMax: catalog.nameMax ?? 16,
    rerender,
    rename: (name) => ask(() => api.pets.rename({ species: entry.id, name })),
    onActivate: (id) => ask(() => api.pets.activate(id)),
    onHatch: async (id) => {
      if (!(await ask(() => api.pets.hatch({ species: id, name: draft.trim() })))) return;
      fresh = id;
      forget();
      rerender({ focus: id });
    },
  };

  const move = (e) => {
    const at = entries.findIndex((x) => x.id === selected);
    const to = gridMove(at, e.key, entries.length, GRID_COLUMNS);
    if (to === at && !['Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    select(entries[to].id);
  };

  return h(
    'div',
    { class: 'pets-page' },
    h('p', { class: 'note' }, 'Only your active pet earns XP. Switch any time: nothing is lost.'),
    h(
      'div',
      { class: 'pets-grid', role: 'listbox', 'aria-label': 'Pets', onkeydown: move },
      entries.map((e) => card(e, speciesOf(e.id), { isSelected: e.id === selected, onSelect: select })),
    ),
    actionBar(entry, speciesOf(entry.id), ctx),
  );
}
