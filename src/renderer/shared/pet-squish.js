// How the body of the pet answers the hand, with no frames from the pack: it squashes under a press, boings at a
// click (a hop that lands in a squash), and when it is picked up it hangs from its head, swings with the speed of the
// cursor and bounces when it is dropped. A few springs and one hop. Pure rules (no DOM, no timers): the host calls
// `update` on every frame and draws with `scaleX`, `scaleY`, `lean` and `air`.

export const SQUISH = {
  press: -0.14, // stretch while pressed: squat and wide
  held: 0.1, // stretch while held: a little taller
  heldAir: 3, // rows off the floor while held
  hop: 36, // rows per second off the floor at a click (about 3 rows high)
  launch: 5, // stretch per second given at the take-off, so it stretches as it rises
  gravity: 220, // rows per second squared
  landing: 0.1, // stretch per second lost for each row per second of speed at touchdown
  maxLean: 0.5, // radians
  leanPerPx: 0.0006, // radians for each px per second of cursor speed
  speedFade: 0.06, // seconds for the cursor speed to fade out when no moves come
};

// Springs: stiffness (1/s²) and damping (1/s). Under-damped, so they overshoot and wobble before they rest.
const STRETCH_SPRING = { k: 320, d: 16 };
const LEAN_SPRING = { k: 180, d: 9 };
const AIR_SPRING = { k: 600, d: 40 }; // lifting to the held height

const MAX_STEP = 0.05; // s: a long pause (sleep, a hidden window) must not blow the springs up
const clamp = (x, max) => Math.max(-max, Math.min(max, x));

export class Squish {
  /** Do not disturb or Reduce Motion: no reaction at all. */
  calm = false;
  stretch = 0; // + tall and thin, - squat and wide
  lean = 0; // radians; + swings the feet to the left (the pet hangs from its head)
  air = 0; // rows above the floor
  held = false;
  #pressed = false;
  #stretchV = 0;
  #leanV = 0;
  #airV = 0;
  #speed = 0; // px per second of the cursor while the pet is held

  /** Scale about the feet. Volume stays about the same: tall is thin, squat is wide. */
  get scaleY() {
    return 1 + this.stretch;
  }

  get scaleX() {
    return 1 - 0.7 * this.stretch;
  }

  /** In the user's hands or in the air: it does not go for a walk. */
  get busy() {
    return this.held || this.#pressed || this.air > 0;
  }

  /** The pointer goes down on the pet: it squashes under it. */
  press() {
    if (!this.calm) this.#pressed = true;
  }

  /** A press that did not move and let go (a click): boing. In the air it only boings again (no second hop: spamming would climb). */
  pop() {
    if (this.calm) return;
    this.#pressed = false;
    if (this.air < 1) this.#airV = SQUISH.hop;
    this.#stretchV += SQUISH.launch;
  }

  /** The press turned into a drag: the pet is picked up. */
  pickUp() {
    if (this.calm) return;
    this.#pressed = false;
    this.held = true;
  }

  /** The cursor moved `dx` px in `ms` while the pet is held. */
  drag(dx, ms) {
    if (this.held && ms > 0) this.#speed = 0.5 * this.#speed + (0.5 * dx * 1000) / ms;
  }

  /** The pet is let go: it falls from where it hangs and bounces. */
  drop() {
    this.held = false;
    this.#pressed = false;
  }

  update(ms) {
    if (this.calm) return this.#rest();
    const dt = Math.min(ms / 1000, MAX_STEP);

    const stretchTarget = this.held ? SQUISH.held : this.#pressed ? SQUISH.press : 0;
    this.#stretchV += (-STRETCH_SPRING.k * (this.stretch - stretchTarget) - STRETCH_SPRING.d * this.#stretchV) * dt;
    this.stretch += this.#stretchV * dt;

    this.#speed *= Math.exp(-dt / SQUISH.speedFade);
    const leanTarget = this.held ? clamp(this.#speed * SQUISH.leanPerPx, SQUISH.maxLean) : 0;
    this.#leanV += (-LEAN_SPRING.k * (this.lean - leanTarget) - LEAN_SPRING.d * this.#leanV) * dt;
    this.lean += this.#leanV * dt;

    if (this.held) {
      this.#airV += (-AIR_SPRING.k * (this.air - SQUISH.heldAir) - AIR_SPRING.d * this.#airV) * dt;
      this.air += this.#airV * dt;
    } else if (this.air > 0 || this.#airV > 0) {
      this.#airV -= SQUISH.gravity * dt;
      this.air += this.#airV * dt;
      if (this.air <= 0) {
        const impact = -this.#airV;
        this.#stretchV -= impact * SQUISH.landing; // the harder it lands, the flatter it gets
        this.air = 0;
        this.#airV = 0;
      }
    }
  }

  #rest() {
    this.stretch = this.#stretchV = 0;
    this.lean = this.#leanV = 0;
    this.air = this.#airV = this.#speed = 0;
    this.held = this.#pressed = false;
  }
}
