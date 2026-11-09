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

const WOOZY_FRAMES = ['half', 'blink']; // dizzy: the eyes half shut, then shut
const WOOZY_FRAME_MS = 240;
const WOOZY_SWAY_MS = 110; // and it sways a pixel to each side

/**
 * The animator, plus the rules of the app:
 * - Hearts and sparkles are a reaction, not a state. The pack makes a happy pet throw them all the time, but a pet
 *   can be happy for days, so they only come in a burst after `rejoice(ms)` (the happy pose itself stays).
 * - Held by the user: the arms-up pose, and `hop` rows off the ground (a click's hop, being held up). How the body
 *   squashes and swings is in pet-squish.js; pet-view.js feeds the result in here.
 * - Dizzy (`woozy`): the eyes half shut and a pixel of sway. Dust (`dust`, `skidDust`) when it lands and skids.
 * - "Calm" mode: no effects and no cheer, just the idle loop of the mood's pose.
 */
export class DesktopPet extends PetAnimator {
  calm = false;
  joyLeft = 0; // ms of hearts and sparkles still to come
  held = false;
  hop = 0; // whole rows above the ground; the shadow shrinks with them
  shadowApart = false; // the host draws the shadow itself (see `drawShadow`)
  woozy = false; // dizzy

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

  /** Which way the creature faces on the screen: 1 to the left, -1 to the right, 0 to the front (it never turns). */
  get facingSign() {
    const facing = this.stage.facing;
    if (facing === 'front') return 0;
    return (facing === 'left') !== this.flip ? 1 : -1;
  }

  get frameName() {
    if (this.held) return 'cheer1';
    if (this.woozy) return WOOZY_FRAMES[Math.floor(this.t / WOOZY_FRAME_MS) % WOOZY_FRAMES.length];
    return super.frameName;
  }

  _shiverX() {
    if (this.woozy) return Math.floor(this.t / WOOZY_SWAY_MS) % 2 === 0 ? 1 : -1;
    return super._shiverX();
  }

  /**
   * Dust at both sides of the feet: it landed. `strong`: a second round right after, for a hard landing. The pack
   * gives none to a floater (it never touches the ground), but one that is thrown and lands gets it too.
   */
  dust(strong = false) {
    if (this.calm) return;
    this._spawnPuffs(this.t);
    if (strong) this._spawnPuffs(this.t + 90);
  }

  /** One puff behind the feet of a pet that skids; `direction`: where it goes (1 right, -1 left). */
  skidDust(direction) {
    if (this.calm) return;
    const e = this.stage.shadowEllipse;
    const cx = this.flip ? this.stage.size - e.cx : e.cx;
    const side = direction > 0 ? -1 : 1;
    this.parts.push({
      kind: 'puff',
      fx: 'puff',
      x: this.x + Math.floor(cx + side * e.rx),
      y: Math.floor(e.cy),
      side,
      mirror: side > 0,
      born: this.t,
      life: this.fx.puff.frames * this.T.puff.frame,
    });
  }

  get lift() {
    return super.lift - this.hop;
  }

  _drawShadow(ctx, scale, X, oy, lift) {
    if (!this.shadowApart) super._drawShadow(ctx, scale, X, oy, lift);
  }

  /** Only the shadow, for a host that draws the body tilted or upside down: the shadow stays on the floor. */
  drawShadow(ctx, scale, ox = 0, oy = 0) {
    super._drawShadow(ctx, scale, ox + this.x * scale, oy, this.lift);
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
