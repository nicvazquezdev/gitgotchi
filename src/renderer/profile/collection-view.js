// Profile > Collection: the companions the user has, one place per species (like a dex). A grid of cards and, beside
// it, the detail of the selected one with the one action that fits it: make it the active companion (from then on it
// earns all the new XP) or, for a species not hatched yet, hatch it. The rules live in the main process (petService);
// this page only asks.
import { h } from '../shared/dom.js';
import { icon, spriteImg, xpBar } from '../shared/ui.js';
import { plural } from '../shared/format.js';
import { cup, lock } from '../shared/pixel-art.js';
import { dayLabel } from './achievements-view.js';

export const GRID_COLUMNS = 4;
const PORTRAIT_MAX = 112; // px: biggest sprite in the detail's portrait (a whole multiple of its native size)

// ---------- Pure helpers ----------

/** "about 3 days at your pace": how long `xp` takes at the person's usual pace (`weeklyXp`, the baseline). */
export function paceText(xp, weeklyXp) {
  const days = (xp / Math.max(1, weeklyXp)) * 7;
  if (days < 1) return 'less than a day at your pace';
  if (days < 14) return `about ${plural(Math.round(days), 'day')} at your pace`;
  return `about ${plural(Math.round(days / 7), 'week')} at your pace`;
}

/** The pet that evolves next: the hatched one, not fully grown, with the least XP left to its next stage. */
export function nextEvolution(entries) {
  const growing = entries.filter((entry) => entry.hatched && !entry.mastered);
  return growing.reduce((best, entry) => (!best || entry.xpToNextStage < best.xpToNextStage ? entry : best), null);
}

/** What to look at next, as one sentence: who evolves next and how far that is, or what is left to collect. */
export function goalText({ entries, hatched, total }, weeklyXp) {
  const next = nextEvolution(entries);
  if (next) {
    const { name, nextStageLevel, xpToNextStage } = next;
    return `${name} evolves next, at level ${nextStageLevel}: ${xpToNextStage} XP to go, ${paceText(xpToNextStage, weeklyXp)}.`;
  }
  return hatched < total
    ? 'Everyone is fully grown. Hatch a new companion to keep collecting.'
    : `All ${total} companions hatched and fully grown. Hall of fame complete!`;
}

/** Where the arrow keys go in the grid (`index` of `count` cards, `columns` wide); the same card for any other key. */
export function gridMove(index, key, count, columns = GRID_COLUMNS) {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns }[key];
  const next = index + (step ?? 0);
  return step === undefined || next < 0 || next >= count ? index : next;
}

/** The day an ISO time falls on for the person ('YYYY-MM-DD', local), as `dayLabel` wants it. */
const localDay = (iso) => new Date(iso).toLocaleDateString('en-CA');

// ---------- What the page remembers between renders (a status arrives every few minutes) ----------

let selected = null; // species id on show; null: the active pet
let picked = false; // the starting pick (from the address) was applied
let busy = false; // a request to the main process is on its way
let problem = null; // what went wrong with the last one
let fresh = null; // species hatched a moment ago (its reveal plays once)
let renaming = false; // the name of the selected pet is being edited
let draft = ''; // what was typed in the name field (renaming, or naming a pet to hatch)

const forget = () => {
  problem = null;
  renaming = false;
  draft = '';
};

// ---------- Small parts ----------

const bolt = (size = 12) => icon('bolt', { size, stroke: 2.6 });

/** Four squares, one per stage: filled up to the stage the pet is in; the next one glows when it is a level away. */
const stagePips = (species, stageIndex, soon) =>
  h(
    'span',
    { class: 'pips', ariaHidden: 'true' },
    species.stages.map((_, i) =>
      h('i', { class: i <= stageIndex ? 'on' : soon && i === stageIndex + 1 ? 'soon' : '' }),
    ),
  );

const activeChip = () => h('span', { class: 'col-chip active' }, bolt(11), 'Active');
const masteredChip = () => h('span', { class: 'col-chip master tier-gold' }, cup(1), 'Fully grown');

/** A trophy cup in gold: the pet is fully grown. */
const trophy = (scale = 1) => h('span', { class: 'col-cup tier-gold', title: 'Fully grown' }, cup(scale));

// ---------- The grid ----------

/** One place of the dex: the pet that lives there, or the silhouette of the one still to hatch. */
function mate(entry, species, { isSelected, onSelect, index }) {
  const baby = species.stages[0];
  const stage = entry.hatched ? species.stages[entry.stageIndex] : baby;
  const number = `No.${String(entry.number).padStart(2, '0')}`;
  const classes = [
    'mate',
    entry.hatched ? 'hatched' : 'locked',
    entry.active && 'active',
    entry.mastered && 'mastered',
    isSelected && 'selected',
  ].filter(Boolean);
  const label = entry.hatched
    ? `${entry.name}, ${stage.name}, level ${entry.level}${entry.active ? ', active' : ''}${entry.mastered ? ', fully grown' : ''}`
    : `${number}, not hatched yet`;

  const el = h(
    'button',
    {
      class: classes.join(' '),
      type: 'button',
      role: 'option',
      'aria-selected': String(isSelected),
      'aria-label': label,
      tabIndex: isSelected ? 0 : -1,
      dataset: { key: entry.id },
      style: { '--tint': species.tint },
      onclick: () => onSelect(entry.id),
    },
    h(
      'span',
      { class: 'mate-art' },
      h('span', { class: 'floor', ariaHidden: 'true' }),
      entry.hatched ? spriteImg(stage.file, stage.size, 2, '') : spriteImg(baby.silhouette, baby.size, 2, ''),
      h(
        'span',
        { class: 'mate-top' },
        h('span', { class: 'mate-no' }, entry.hatched ? '' : number),
        entry.active ? activeChip() : entry.mastered ? trophy() : null,
      ),
      entry.hatched ? null : h('span', { class: 'mate-lock tier-locked' }, lock(2)),
    ),
    h(
      'span',
      { class: 'mate-body' },
      entry.hatched
        ? [
            h('span', { class: 'mate-name pixel-name' }, entry.name, entry.active && entry.mastered ? trophy() : null),
            h('span', { class: 'mate-sub' }, `${stage.name} · Lv ${entry.level}`),
            entry.mastered
              ? h('span', { class: 'mate-done' }, 'Fully grown')
              : xpBar(entry.levelXp / entry.levelXpNeeded, 'sm'),
            stagePips(species, entry.stageIndex, entry.nextStageLevel === entry.level + 1),
          ]
        : [
            h('span', { class: 'mate-name pixel-name quiet' }, '???'),
            h('span', { class: 'mate-sub' }, `${species.type} type`),
            h('span', { class: 'mate-hint' }, 'Click to meet it'),
          ],
    ),
  );
  el.style.setProperty('--i', index);
  return el;
}

// ---------- The detail ----------

/** Name and form of a pet in the detail, with the pencil that edits the name. */
function titleBlock(entry, { nameMax, onRename, onSaveName, onCancelName }) {
  if (renaming) {
    const input = h('input', {
      class: 'col-name-input',
      value: draft || entry.name,
      maxLength: nameMax,
      autocomplete: 'off',
      spellcheck: false,
      'aria-label': 'Name',
      dataset: { key: 'name' },
      oninput: (e) => (draft = e.target.value),
      onkeydown: (e) => {
        if (e.key === 'Enter') onSaveName();
        if (e.key === 'Escape') onCancelName();
      },
    });
    return h(
      'div',
      { class: 'col-rename' },
      input,
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'Save name', title: 'Save', onclick: onSaveName },
        icon('check', { size: 16, stroke: 2.6 }),
      ),
      h(
        'button',
        { class: 'icon-btn', type: 'button', 'aria-label': 'Cancel', title: 'Cancel', onclick: onCancelName },
        icon('x', { size: 16, stroke: 2.4 }),
      ),
    );
  }
  return h(
    'div',
    { class: 'col-title' },
    h('h2', { class: 'pixel-name col-name' }, entry.name),
    h(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        'aria-label': `Rename ${entry.name}`,
        title: 'Rename',
        dataset: { key: 'rename' },
        onclick: onRename,
      },
      icon('pencil', { size: 15, stroke: 2.2 }),
    ),
  );
}

/** The evolution line in small: the forms reached, the one it is in, and the ones still hidden. */
function miniLine(species, stages, stageIndex) {
  return h(
    'div',
    { class: 'col-line' },
    species.stages.map((stage, i) => {
      const state = i === stageIndex ? 'now' : i < stageIndex ? 'done' : 'locked';
      return h(
        'div',
        { class: `mini ${state}` },
        h(
          'div',
          { class: 'mini-art' },
          state === 'locked'
            ? spriteImg(stage.silhouette, stage.size, 1)
            : spriteImg(stage.file, stage.size, 1, stage.name),
        ),
        h('div', { class: 'mini-name' }, state === 'locked' ? '???' : stage.name),
        h(
          'div',
          { class: 'mini-lv' },
          state === 'locked' ? `Lv ${stages[i].level}` : state === 'now' ? 'now' : 'reached',
        ),
      );
    }),
  );
}

function hatchedDetail(entry, species, status, ctx) {
  const stage = species.stages[entry.stageIndex];
  const left = entry.levelXpNeeded - entry.levelXp;
  const portrait = h('canvas', {
    class: 'sprite',
    style: { width: `${stage.size * Math.max(2, Math.floor(PORTRAIT_MAX / stage.size))}px` },
  });
  ctx.animate(portrait, () => ({
    species,
    stageIndex: entry.stageIndex,
    mood: entry.active ? status.mood : 'neutral',
  }));

  return [
    h(
      'div',
      { class: 'col-hero' },
      h(
        'div',
        { class: `portrait pixel-cut${fresh === entry.id ? ' reveal' : ''}`, style: { '--tint': species.tint } },
        h('div', { class: 'inner pixel-cut' }, h('div', { class: 'floor', ariaHidden: 'true' }), portrait),
      ),
      h(
        'div',
        { class: 'col-who' },
        titleBlock(entry, ctx),
        h('div', { class: 'col-form' }, `${stage.name} · ${ctx.catalog.stages[entry.stageIndex].name}`),
        h(
          'div',
          { class: 'col-chips' },
          entry.active ? activeChip() : null,
          entry.mastered ? masteredChip() : null,
          h('span', { class: 'col-chip' }, `Hatched ${dayLabel(localDay(entry.bornAt))}`),
        ),
      ),
    ),
    h(
      'div',
      { class: 'col-progress' },
      h(
        'div',
        { class: 'col-level' },
        h('b', {}, `Level ${entry.level}`),
        entry.mastered
          ? h('span', { class: 'meta' }, `${entry.xp} XP earned`)
          : h('span', { class: 'xp-text' }, `${entry.levelXp} / ${entry.levelXpNeeded} XP`),
      ),
      xpBar(entry.mastered ? 1 : entry.levelXp / entry.levelXpNeeded, 'lg'),
      entry.mastered
        ? h('div', { class: 'col-next' }, 'Fully grown. It keeps leveling while it is active.')
        : [
            h(
              'div',
              { class: 'col-next split' },
              h('span', {}, `${left} XP to level ${entry.level + 1}`),
              h('span', { class: 'meta' }, paceText(left, status.baseline)),
            ),
            h(
              'div',
              { class: 'col-evolves' },
              icon('arrow', { size: 13, stroke: 2.4 }),
              entry.nextStageLevel === entry.level + 1
                ? 'The next level is an evolution!'
                : `Evolves at level ${entry.nextStageLevel}`,
              entry.nextStageLevel === entry.level + 1
                ? null
                : h('span', { class: 'meta' }, ` · ${entry.xpToNextStage} XP to go`),
            ),
          ],
    ),
    miniLine(species, ctx.catalog.stages, entry.stageIndex),
    actionBlock(entry, status, ctx),
  ];
}

/** The one thing to do with this pet. The active one has nothing to do: it says what it is doing. */
function actionBlock(entry, status, { onActivate }) {
  if (entry.active) {
    return h(
      'div',
      { class: 'col-action' },
      h(
        'div',
        { class: 'col-earning' },
        h('span', { class: 'col-earning-icon' }, bolt(18)),
        h(
          'div',
          {},
          h('b', {}, fresh === entry.id ? `Welcome, ${entry.name}!` : 'Earning all new XP'),
          h(
            'div',
            { class: 'meta' },
            fresh === entry.id ? 'It is the active companion now.' : `+${entry.weekXp} XP this week`,
          ),
        ),
      ),
    );
  }
  const active = status.collection.entries.find((e) => e.active);
  return h(
    'div',
    { class: 'col-action' },
    h(
      'button',
      { class: 'btn primary pixel-cut block lg', type: 'button', disabled: busy, onclick: () => onActivate(entry.id) },
      bolt(16),
      `Make ${entry.name} active`,
    ),
    h(
      'p',
      { class: 'col-help' },
      `From now on, new XP goes to ${entry.name}. ${active.name} keeps everything it earned.`,
    ),
    problem ? h('p', { class: 'col-problem', role: 'alert' }, problem) : null,
  );
}

function lockedDetail(entry, species, status, ctx) {
  const baby = species.stages[0];
  const active = status.collection.entries.find((e) => e.active);
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
  return [
    h(
      'div',
      { class: 'col-hero' },
      h(
        'div',
        { class: 'portrait pixel-cut', style: { '--tint': species.tint } },
        h(
          'div',
          { class: 'inner pixel-cut' },
          h('div', { class: 'floor', ariaHidden: 'true' }),
          spriteImg(baby.file, baby.size, 3, baby.name),
        ),
      ),
      h(
        'div',
        { class: 'col-who' },
        h('div', { class: 'eyebrow' }, `No.${String(entry.number).padStart(2, '0')} · not hatched`),
        h('h2', { class: 'pixel-name col-name' }, species.line),
        h('div', { class: 'col-chips' }, h('span', { class: 'col-chip' }, `${species.type} type`)),
      ),
    ),
    h('p', { class: 'col-desc' }, species.desc),
    h(
      'div',
      { class: 'col-progress' },
      h(
        'div',
        { class: 'col-level' },
        h('b', {}, 'Evolution line'),
        h('span', { class: 'meta' }, 'Revealed as it grows'),
      ),
    ),
    h(
      'div',
      { class: 'col-line' },
      species.stages.map((stage, i) =>
        h(
          'div',
          { class: `mini ${i === 0 ? 'now' : 'locked'}` },
          h(
            'div',
            { class: 'mini-art' },
            spriteImg(i === 0 ? stage.file : stage.silhouette, stage.size, 1, i === 0 ? stage.name : ''),
          ),
          h('div', { class: 'mini-name' }, i === 0 ? stage.name : '???'),
          h('div', { class: 'mini-lv' }, i === 0 ? 'Baby' : `Lv ${ctx.catalog.stages[i].level}`),
        ),
      ),
    ),
    h(
      'div',
      { class: 'col-action' },
      h('label', { class: 'field col-field' }, h('span', { class: 'meta' }, 'Name'), input),
      h(
        'button',
        {
          class: 'btn primary pixel-cut block lg',
          type: 'button',
          disabled: busy,
          onclick: () => ctx.onHatch(entry.id),
        },
        icon('plus', { size: 16, stroke: 2.6 }),
        label,
      ),
      h(
        'p',
        { class: 'col-help' },
        `It starts as a baby and becomes your active companion. ${active.name} keeps everything it earned.`,
      ),
      problem ? h('p', { class: 'col-problem', role: 'alert' }, problem) : null,
    ),
  ];
}

// ---------- Page ----------

function banner({ collection }, weeklyXp, selectedId, onGoal) {
  const { hatched, total, mastered, entries } = collection;
  const next = nextEvolution(entries);
  return h(
    'section',
    { class: 'col-banner' },
    h(
      'div',
      { class: 'col-banner-text' },
      h('h2', {}, 'Your companions'),
      h('p', { class: 'muted' }, 'Only your active companion earns XP. Switch any time: nothing is ever lost.'),
      h(
        next ? 'button' : 'p',
        next
          ? { class: 'col-goal', type: 'button', onclick: () => onGoal(next.id), title: `Look at ${next.name}` }
          : { class: 'col-goal static' },
        bolt(13),
        goalText(collection, weeklyXp),
        next && next.id !== selectedId ? icon('chevron', { size: 13, stroke: 2.6 }) : null,
      ),
    ),
    h(
      'div',
      { class: 'col-count' },
      h(
        'div',
        { class: 'col-count-top' },
        h('b', {}, `${hatched} / ${total}`),
        h('span', { class: 'meta' }, 'hatched'),
      ),
      h(
        'div',
        { class: 'col-slots', role: 'img', 'aria-label': `${hatched} of ${total} hatched, ${mastered} fully grown` },
        entries.map((e) => h('i', { class: e.mastered ? 'master' : e.hatched ? 'on' : '' })),
      ),
      h('div', { class: 'meta col-count-sub' }, trophy(), `${mastered} fully grown`),
    ),
  );
}

/**
 * The page. The state of the page (which pet is on show, a name being typed) is kept here, so a status that arrives
 * every few minutes does not lose it.
 * @param {object} status  the pet status (`collection`, `baseline`, `mood`)
 * @param {{ catalog, api, rerender: (options?: { focus?: string }) => void, animate: (canvas, options) => void,
 *   pick?: string, enter?: boolean }} ctx
 */
export function collectionPage(status, { catalog, api, rerender, animate, pick, enter = false }) {
  const { entries } = status.collection;
  if (pick && !picked) selected = pick;
  picked = true;
  if (!entries.some((e) => e.id === selected)) selected = status.collection.active;
  const entry = entries.find((e) => e.id === selected);
  const species = catalog.species.find((s) => s.id === entry.id);

  /** Puts another pet on show and the focus on its card (keyboard users keep their place; a click already has it). */
  const select = (id) => {
    if (id === selected) return;
    selected = id;
    fresh = null;
    forget();
    rerender({ focus: id });
  };
  /** Asks the main process; it answers `{ error, message }` when it cannot. The status that follows redraws the page. */
  const ask = async (request) => {
    busy = true;
    problem = null;
    rerender();
    const result = await request();
    busy = false;
    if (result?.error) problem = result.message;
    rerender();
    return !result?.error;
  };
  const ctx = {
    catalog,
    nameMax: catalog.nameMax ?? 16,
    animate,
    onActivate: (id) => ask(() => api.pets.activate(id)),
    onHatch: async (id) => {
      const name = draft.trim();
      if (await ask(() => api.pets.hatch({ species: id, name }))) {
        fresh = id;
        forget();
        rerender();
      }
    },
    onRename: () => {
      renaming = true;
      draft = entry.name;
      rerender();
    },
    onSaveName: async () => {
      const name = draft.trim();
      if (name === entry.name || (await ask(() => api.pets.rename({ species: entry.id, name })))) {
        renaming = false;
        draft = '';
        rerender();
      }
    },
    onCancelName: () => {
      renaming = false;
      draft = '';
      rerender();
    },
  };

  const move = (e) => {
    const at = entries.findIndex((x) => x.id === selected);
    const to = gridMove(at, e.key, entries.length);
    if (to === at && !['Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    select(entries[to].id);
  };

  return h(
    'div',
    { class: `col-page${enter ? ' enter' : ''}` },
    banner(status, status.baseline, selected, select),
    h(
      'div',
      { class: 'col-body' },
      h(
        'div',
        { class: 'col-grid', role: 'listbox', 'aria-label': 'Companions', onkeydown: move },
        entries.map((e, i) =>
          mate(
            e,
            catalog.species.find((s) => s.id === e.id),
            { isSelected: e.id === selected, onSelect: select, index: i },
          ),
        ),
      ),
      h(
        'aside',
        { class: 'col-detail card', 'aria-label': 'Selected companion', style: { '--tint': species.tint } },
        entry.hatched ? hatchedDetail(entry, species, status, ctx) : lockedDetail(entry, species, status, ctx),
      ),
    ),
  );
}
