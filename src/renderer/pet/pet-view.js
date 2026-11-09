// The desktop pet on its canvas: owns the animator, the one animation loop, the integer-scale layout and the
// policy around the animation (when it walks, when it cheers, calm mode). pet.js decides what happens (moods,
// events); the animation rules themselves are in shared/pet-animator.js.
import { createPet, FLOOR_MAX, PAD } from '../shared/pet-sprites.js';
import { Stroller } from '../shared/pet-stroll.js';
import { Squish } from '../shared/pet-squish.js';

/** Screen px per native px at the smallest size: pet sizes are whole multiples of it (see PET_SIZE_RANGE). */
export const PX_PER_SCALE = 52;

// The canvas is drawn in whole native pixels. Keep in sync with PET_CANVAS in src/main/config.js (a test checks it).
const HEADROOM = 16; // hearts and particles float above the creature
const BELOW = 2; // rows under the floor line
const ROWS = HEADROOM + FLOOR_MAX + BELOW;

const JOY_MS = 8000; // hearts and sparkles after a celebration (not for as long as the mood lasts)
const HAPPY_AFTER_CHEER_MS = 5 * 60 * 1000; // then the pet goes back to its normal state
const MAX_FRAME_MS = 50; // a long pause (sleep, a hidden window) must not make the animation jump ahead
const POKE_OUT = 4; // the 6 px of padding around a sprite may stick out of the canvas by this much at the edges
const HIT_SLACK = 2; // native rows above the creature that still count as the creature (it hops)

export class PetView {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ getWidth: () => number, onLayout?: (layout: { width: number, height: number }) => void }} options
   *   `getWidth`: CSS px the canvas may use (the window width). `onLayout`: the canvas size changed (CSS px).
   */
  constructor(canvas, { getWidth, onLayout }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.getWidth = getWidth;
    this.onLayout = onLayout;
    this.scale = 4;
    this.pet = null;
    this.stroller = new Stroller();
    this.squish = new Squish(); // how the body answers the hand: pet.js tells it about the press, click and drag
    this.calm = false; // Do not disturb or Reduce Motion: only the idle loop
    this.still = false; // the user holds or points at the pet
    this.mood = 'neutral';
    this.wantsHappy = false; // after a cheer, the pet is happy
    this.happyUntil = 0; // when that happiness ends (a performance.now() time), or 0
    this.native = { width: 0, oy: 0 }; // canvas width in native px; row of the creature's cell inside the canvas
    this.ds = 1; // device px per native px
    this.dpr = 0;
    this.last = performance.now();
    this.loading = 0; // sequence number of the latest creature load: an older one that finishes late is dropped
    requestAnimationFrame((now) => this.tick(now));
  }

  // ---------- Control ----------

  /** Shows another creature (or the first one). Keeps the current one on screen until the new images are ready. */
  async setCreature(speciesId, stageIndex) {
    const load = ++this.loading;
    const pet = await createPet(speciesId, stageIndex);
    if (load !== this.loading) return;
    pet.calm = this.calm;
    pet.setMood(this.mood);
    this.pet = pet;
    this.layout();
  }

  /** The pose and effects of a mood. The desktop pet never calls it (it rests in neutral); the popover's portrait does. */
  setMood(mood) {
    this.mood = mood;
    this.wantsHappy = false;
    this.happyUntil = 0;
    this.pet?.setMood(mood);
  }

  /** A merged PR, an approval or an achievement: cheer, then a burst of hearts and a while of being happy. */
  celebrate() {
    if (this.calm || !this.pet) return;
    this.pet.cheer();
    this.wantsHappy = true;
  }

  setCalm(calm) {
    if (calm === this.calm) return;
    this.calm = calm;
    this.squish.calm = calm;
    if (this.pet) {
      this.pet.calm = calm;
      if (calm) this.stroller.stop(this.pet);
    }
  }

  /** `still`: the user is holding or pointing at the pet, so it does not walk away from them. */
  setStill(still) {
    this.still = still;
  }

  /** The canvas gets `scale` CSS px per native px (a whole number) and fills the width it is given. */
  setScale(scale) {
    if (scale === this.scale) return;
    this.scale = scale;
    this.layout();
  }

  // ---------- Layout ----------

  /** Sizes the canvas in device pixels (a whole number of them per native px, so every pixel stays sharp). */
  layout() {
    if (!this.pet) return;
    const { stage } = this.pet;
    const dpr = window.devicePixelRatio || 1;
    const ds = Math.max(1, Math.round(this.scale * dpr));
    // The canvas is as wide as the window allows, but never narrower than the creature plus its edges.
    const width = Math.max(stage.size - 2 * POKE_OUT, Math.floor(this.getWidth() / this.scale));

    this.dpr = dpr;
    this.ds = ds;
    this.native = { width, oy: HEADROOM + FLOOR_MAX - this.pet.groundY };
    this.canvas.width = width * ds;
    this.canvas.height = ROWS * ds;
    const css = { width: (width * ds) / dpr, height: (ROWS * ds) / dpr };
    this.canvas.style.width = `${css.width}px`;
    this.canvas.style.height = `${css.height}px`;
    this.onLayout?.(css);

    // Where the pet stands, and how far it may walk: the floor edges (the padding may stick out a little).
    this.pet.setFloor(-POKE_OUT, Math.floor(width - stage.size + POKE_OUT));
    this.stroller.home = Math.round((width - stage.size) / 2);
    this.stroller.stop(this.pet); // standing at home, not walking
    this.draw();
  }

  // ---------- Loop ----------

  tick(now) {
    requestAnimationFrame((next) => this.tick(next));
    const dt = Math.min(MAX_FRAME_MS, now - this.last);
    this.last = now;
    const pet = this.pet;
    if (!pet) return;
    if ((window.devicePixelRatio || 1) !== this.dpr) this.layout(); // moved to another display

    this.squish.update(dt);
    pet.held = this.squish.held;
    pet.hop = Math.round(this.squish.air);
    this.stroller.update(dt, pet, { calm: this.calm, still: this.still || this.squish.busy });
    pet.update(dt);
    if (this.wantsHappy && pet.state !== 'cheer' && pet.state !== 'landing') {
      this.wantsHappy = false;
      pet.setMood('happy');
      pet.rejoice(JOY_MS);
      this.happyUntil = now + HAPPY_AFTER_CHEER_MS;
    }
    if (this.happyUntil && now >= this.happyUntil) {
      this.happyUntil = 0;
      pet.setMood(this.mood); // back to its normal state
    }
    this.draw();
  }

  draw() {
    const { ctx, canvas, pet, squish, ds, native } = this;
    if (!pet) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // The body squashes about the feet (the floor line) and swings about the head, the way it is held.
    const x = (pet.x + pet.stage.size / 2) * ds;
    const feet = (native.oy + pet.groundY) * ds;
    const head = (native.oy + PAD) * ds;
    ctx.save();
    ctx.translate(x, head);
    ctx.rotate(squish.lean);
    ctx.translate(-x, -head);
    ctx.translate(x, feet);
    ctx.scale(squish.scaleX, squish.scaleY);
    ctx.translate(-x, -feet);
    pet.draw(ctx, ds, 0, native.oy * ds);
    ctx.restore();
  }

  // ---------- Where the creature is ----------

  /**
   * The creature itself (not its cell, nor the effects) in CSS px of the window, or null before it is loaded.
   * Used to decide what counts as a click on the pet, and where the popover points.
   */
  bounds() {
    const { pet } = this;
    if (!pet) return null;
    const box = this.canvas.getBoundingClientRect();
    const k = box.width / this.native.width; // CSS px per native px
    const size = pet.stage.nominalSize;
    return {
      x: box.left + (pet.x + PAD) * k,
      y: box.top + (this.native.oy + pet.lift + PAD) * k,
      width: size * k,
      height: size * k,
    };
  }

  /** Is the point (CSS px of the window) on the creature? */
  contains(clientX, clientY) {
    const b = this.bounds();
    if (!b) return false;
    const slack = HIT_SLACK * (b.width / this.pet.stage.nominalSize);
    return clientX >= b.x && clientX < b.x + b.width && clientY >= b.y - slack && clientY < b.y + b.height;
  }

  /** Nominal size in native px of the creature on screen (the speech bubble sits above its head). */
  get nominalSize() {
    return this.pet?.stage.nominalSize ?? null;
  }
}
