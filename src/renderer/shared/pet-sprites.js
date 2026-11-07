// What the animator needs for one creature: its stage entry in animations.json and the decoded images.
// The animation rules themselves live in pet-animator.js (the pack's reference implementation).
import { PetAnimator } from './pet-animator.js';
import animations from '../../../assets/pets/animations.json' with { type: 'json' };

const ASSETS = new URL('../../../assets/pets/', import.meta.url);

/** Transparent cells around each sprite, so it can stretch, flap and jump (the same on every side). */
export const PAD = animations.pad;

/** Row of the lowest floor line of any stage: every stage is drawn on the same floor. */
export const FLOOR_MAX = Math.max(
  ...animations.lines.flatMap((line) => line.stages.map(({ shadowEllipse: e }) => Math.ceil(e.cy + e.ry))),
);

const images = new Map(); // file -> Promise of the decoded image

/** Decoded image from assets/pets (cached). Rejects when the file is missing, so a bad pack is not silent. */
function loadImage(file) {
  if (!images.has(file)) {
    images.set(
      file,
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => {
          images.delete(file);
          reject(new Error(`Missing sprite asset: ${file}`));
        };
        img.src = new URL(file, ASSETS).href;
      }),
    );
  }
  return images.get(file);
}

/**
 * The animator, plus two rules of the app:
 * - Hearts and sparkles are a reaction, not a state. The pack makes a happy pet throw them all the time, but a pet
 *   can be happy for days, so they only come in a burst after `rejoice(ms)` (the happy pose itself stays).
 * - "Calm" mode: no effects and no cheer, just the idle loop of the mood's pose.
 */
export class DesktopPet extends PetAnimator {
  calm = false;
  joyLeft = 0; // ms of hearts and sparkles still to come

  setMood(mood) {
    super.setMood(mood);
    this.joyLeft = 0;
    this.nextHeart = Infinity; // super turned them on for a happy mood
    this.nextSparkle = Infinity;
  }

  /** A burst of hearts and sparkles for `ms`, as the pack plays them in the happy mood. Happy mood only. */
  rejoice(ms) {
    if (this.mood !== 'happy' || this.calm) return;
    this.joyLeft = ms;
    this.nextHeart = this.t + 200; // the same start as setMood('happy') in the reference
    this.nextSparkle = this.t + 450;
  }

  update(dt) {
    if (this.joyLeft > 0) {
      this.joyLeft -= dt;
      if (this.joyLeft <= 0) {
        this.nextHeart = Infinity;
        this.nextSparkle = Infinity;
      }
    }
    super.update(dt);
    if (this.calm) {
      this.parts.length = 0; // hearts, sparkles, ambient particles and dust
      this.sweat = null;
      this.shiver = null;
    }
  }

  cheer() {
    if (!this.calm) super.cheer();
  }
}

/** The stage entry of animations.json for a species id and stage index (the first line for an unknown id). */
export function stageOf(speciesId, stageIndex) {
  const line = animations.lines.find((l) => l.id === speciesId) ?? animations.lines[0];
  const stage = line.stages[Math.max(0, Math.min(line.stages.length - 1, stageIndex ?? 0))];
  return { line, stage };
}

/**
 * Loads the images and builds the animator of a creature.
 * @param {string} speciesId
 * @param {number} stageIndex
 * @param {{ rng?: () => number }} [options]  `rng`: inject a seeded one for tests
 * @returns {Promise<DesktopPet>}
 */
export async function createPet(speciesId, stageIndex, { rng } = {}) {
  const { line, stage } = stageOf(speciesId, stageIndex);
  const fxNames = Object.keys(animations.fx);
  const [sheet, shadow, ambientImg, ...fxImages] = await Promise.all([
    loadImage(stage.sheet),
    loadImage(stage.shadow),
    loadImage(line.ambient.file),
    ...fxNames.map((name) => loadImage(animations.fx[name].file)),
  ]);
  const fx = Object.fromEntries(fxNames.map((name, i) => [name, { ...animations.fx[name], img: fxImages[i] }]));
  return new DesktopPet({
    stage,
    timing: animations.timing,
    frames: animations.frames,
    moods: animations.moods,
    sheet,
    shadow,
    fx,
    ambient: { ...fx[line.ambient.fx], fx: line.ambient.fx, img: ambientImg },
    rng,
  });
}
