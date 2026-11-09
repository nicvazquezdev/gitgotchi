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

// The pack has no frames for being held, dizzy or looking up, so these are made of the ones it has.
const HELD_FRAMES = ['cheer1', 'cheer2', 'cheer3', 'cheer2']; // flapping, like a cheer that never lands
const HELD_FRAME_MS = 110;
const DIZZY_MS = 1000; // woozy after being put down
const DIZZY_FRAMES = ['half', 'blink']; // eyes half shut, then shut
const DIZZY_FRAME_MS = 180;
const DIZZY_WOBBLE_MS = 90; // it sways one native px to each side
const PERK_MS = [100, 350, 100]; // a click: up on tiptoe (the popover opens above), then back down
const PERK_LIFT = [-1, -2, -1];

/**
 * The animator, plus the rules of the app:
 * - Hearts and sparkles are a reaction, not a state. The pack makes a happy pet throw them all the time, but a pet
 *   can be happy for days, so they only come in a burst after `rejoice(ms)` (the happy pose itself stays).
 * - Held, put down and clicked: it flaps in the air, lands in dust and is woozy, and perks up at a click.
 * - "Calm" mode: no effects and no cheer, just the idle loop of the mood's pose.
 */
export class DesktopPet extends PetAnimator {
  calm = false;
  joyLeft = 0; // ms of hearts and sparkles still to come
  held = false;
  heldT = 0; // ms since it was picked up
  dizzyT = 0; // ms of being woozy still to go
  perkT = -1; // ms into the perk-up of a click, or -1

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

  /** The user picks the pet up or puts it down. Put down, it lands in dust (a floater has none) and is woozy. */
  hold(on) {
    if (on === this.held || (on && this.calm)) return;
    this.held = on;
    this.heldT = 0;
    if (on) {
      this.perkT = -1;
      this.blinkSeq = null;
      return;
    }
    this.dizzyT = DIZZY_MS;
    if (this.motion !== 'float') this._spawnPuffs(this.t);
  }

  /**
   * A click: the popover opens above the pet, so it stretches up on tiptoe. There are no eyes-up frames in the pack.
   * Not while it cheers, is held or is woozy.
   */
  lookUp() {
    if (this.calm || this.held || this.dizzyT > 0 || this.cheerT >= 0) return;
    this.perkT = 0;
  }

  /** The user's hands are on it, or it is still recovering: it does not go for a walk. */
  get engaged() {
    return this.held || this.dizzyT > 0 || this.perkT >= 0;
  }

  get frameName() {
    if (this.held) return HELD_FRAMES[Math.floor(this.heldT / HELD_FRAME_MS) % HELD_FRAMES.length];
    if (this.dizzyT > 0)
      return DIZZY_FRAMES[Math.floor((DIZZY_MS - this.dizzyT) / DIZZY_FRAME_MS) % DIZZY_FRAMES.length];
    return super.frameName;
  }

  get lift() {
    if (this.held) return this.stage.lift.cheer[1]; // off the ground, not bobbing: the window moves with the hand
    return super.lift + (this.perkT >= 0 ? PERK_LIFT[this._at(PERK_MS, this.perkT)] : 0);
  }

  _shiverX() {
    if (this.dizzyT > 0) return Math.floor(this.dizzyT / DIZZY_WOBBLE_MS) % 2 === 0 ? 1 : -1;
    return super._shiverX();
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
    if (this.held) this.heldT += dt;
    this.dizzyT = Math.max(0, this.dizzyT - dt);
    if (this.perkT >= 0) {
      this.perkT += dt;
      if (this.perkT >= PERK_MS.reduce((a, b) => a + b, 0)) this.perkT = -1;
    }
    if (this.calm) {
      this.parts.length = 0; // hearts, sparkles, ambient particles and dust
      this.sweat = null;
      this.shiver = null;
      this.held = false;
      this.dizzyT = 0;
      this.perkT = -1;
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
