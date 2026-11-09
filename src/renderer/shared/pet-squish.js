// How the body of the pet answers the hand, with no frames from the pack: it squashes under a press, boings at a
// click (a hop that lands in a squash), looks up while the popover it opened is on screen, and when it is picked up
// it hangs from the point where it was grabbed (by the feet it turns upside down), swings with the speed of the
// cursor, and when it is let go it skids a little, rights itself and lands. Shaken or turned over again and again it
// gets dizzy, and an edge of the screen squashes it. A few springs and one hop. Pure rules (no DOM, no timers): the
// host calls `update` on every frame and draws with `scaleX`, `scaleY`, `lean`, `skid`, `gaze` and `air`, and asks for
// the landings (`takeLanding`: dust) and `slideSpeed` (skid dust).

export const SQUISH = {
  press: -0.14, // stretch while pressed: squat and wide
  held: 0.1, // stretch while held: a little taller
  look: 0.06, // stretch while it looks up
  heldAir: 3, // rows off the floor while held
  hop: 36, // rows per second off the floor at a click (about 3 rows high)
  launch: 5, // stretch per second given at the take-off, so it stretches as it rises
  gravity: 220, // rows per second squared
  landing: 0.1, // stretch per second lost for each row per second of speed at touchdown
  maxLean: 0.5, // radians of swing from the cursor speed
  leanPerPx: 0.0006, // radians for each px per second of cursor speed
  speedFade: 0.06, // seconds for the cursor speed to fade out when no moves come
  deadZone: 0.15, // a grab this close to the center (in body heights) hangs it straight
  ramp: 0.2, // and from there it takes this much more to hang it all the way (feet: upside down)
  skid: 0.0003, // radians of forward lean for each px per second it was going when let go
  maxSkid: 0.3, // radians
  slideMin: 350, // px/s: slower than this, the pet does not slide (keep in sync with THROW.minSpeed in main/ui/pet-throw.js)
  slideFade: 0.16, // seconds for the slide to fade out (keep in sync with THROW.fade)
  bump: 0.003, // stretch per second given for each px per second of a hit against an edge of the screen
  maxBump: 4.5,
  bounce: 0.4, // the share of its speed it keeps off a wall (keep in sync with THROW.bounce)
  agitationFade: 2, // seconds for the swing it was given to be forgotten
  dizzyAt: 6, // radians of swing (a flip is π and a bit) within that time that make it dizzy: two turns, or a hard shake
  dizzyFor: 2.4, // seconds it stays dizzy
  dizzyFadeOut: 0.4, // seconds the dizziness takes to wear off at the end
  dizzySway: 0.07, // radians of sway while dizzy
  dizzyHz: 2.2,
};

// Springs: stiffness (1/s²) and damping (1/s). Under-damped, so they overshoot and wobble before they rest.
const STRETCH_SPRING = { k: 320, d: 16 };
const LEAN_SPRING = { k: 180, d: 11 }; // hanging: it swings
const RIGHT_SPRING = { k: 420, d: 28 }; // let go: it rights itself fast, in the time it falls
const SKID_SPRING = { k: 260, d: 14 };
const GAZE_SPRING = { k: 220, d: 15 };
const AIR_SPRING = { k: 600, d: 40 }; // lifting to the held height

const MAX_STEP = 0.05; // s: a long pause (sleep, a hidden window) must not blow the springs up
const clamp = (x, max) => Math.max(-max, Math.min(max, x));

/** One semi-implicit Euler step of a spring that pulls `x` (moving at `v`) to `target`: `[x, v]`. */
const spring = (x, v, target, { k, d }, dt) => {
  const next = v + (-k * (x - target) - d * v) * dt;
  return [x + next * dt, next];
};

export class Squish {
  /** Do not disturb or Reduce Motion: no reaction at all. */
  calm = false;
  stretch = 0; // + tall and thin, - squat and wide
  lean = 0; // radians about the grab point; + swings the feet to the left; π is upside down
  skid = 0; // radians about the feet; + leans the top to the right
  gaze = 0; // 0 to 1: how far it looks up at the popover
  dizzy = 0; // 0 to 1: how dizzy it is
  air = 0; // rows above the floor
  held = false;
  #pressed = false;
  #looking = false;
  #hang = 0; // where the lean settles while held, from where it was grabbed
  #stretchV = 0;
  #leanV = 0;
  #skidV = 0;
  #gazeV = 0;
  #airV = 0;
  #speed = 0; // px per second of the cursor while the pet is held
  #slide = 0; // px per second it was going when let go, fading as the slide does
  #agitation = 0; // radians it has been swung through lately, fading
  #dizzyLeft = 0; // seconds of dizziness to go
  #clock = 0; // seconds, for the sway
  #landed = 0; // the hardest landing since the host last asked, in rows per second

  /** Scale about the feet. Volume stays about the same: tall is thin, squat is wide. */
  get scaleY() {
    return 1 + this.stretch;
  }

  get scaleX() {
    return 1 - 0.7 * this.stretch;
  }

  /** Where the lean settles while it is held (radians): π when it is held by the feet. */
  get hangAngle() {
    return this.#hang;
  }

  /** In the user's hands, in the air, sliding, dizzy or looking at the popover: it does not go for a walk. */
  get busy() {
    return this.held || this.#pressed || this.#looking || this.air > 0 || this.dizzy > 0 || Math.abs(this.#slide) > 20;
  }

  /** px per second it is sliding at after being let go (+ to the right), fading out; 0 when it is not sliding. */
  get slideSpeed() {
    return this.#slide;
  }

  /** How hard it landed since the last call (rows per second, 0 for none): the host raises some dust. */
  takeLanding() {
    const impact = this.#landed;
    this.#landed = 0;
    return impact;
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

  /**
   * The press turned into a drag: the pet is picked up. `toCenter`: from the point it was grabbed to the center of
   * its body, in body heights (x to the right, y down). Held by the head the center is below (it hangs straight),
   * held by the feet it is above (it turns upside down), held by a side it hangs sideways. Near the center it hangs
   * straight, so a grab on the belly does not tip it over.
   */
  pickUp({ x = 0, y = 1 } = {}) {
    if (this.calm) return;
    this.#pressed = false;
    this.held = true;
    const reach = Math.max(0, Math.min(1, (Math.hypot(x, y) - SQUISH.deadZone) / SQUISH.ramp));
    this.#hang = Math.atan2(x, y) * reach; // the angle that puts the center straight below the grab point
  }

  /** The cursor moved `dx` px in `ms` while the pet is held. */
  drag(dx, ms) {
    if (this.held && ms > 0) this.#speed = 0.5 * this.#speed + (0.5 * dx * 1000) / ms;
  }

  /** The pet is let go: it falls from where it hangs, rights itself and bounces, and skids if it was going fast. */
  drop() {
    if (this.held) {
      this.#slide = Math.abs(this.#speed) >= SQUISH.slideMin ? this.#speed : 0;
      if (Math.abs(this.lean) > 1) this.#airV = Math.max(this.#airV, SQUISH.hop * 0.7); // time to turn over
    }
    this.held = false;
    this.#pressed = false;
    this.#hang = 0;
  }

  /**
   * The window slid into an edge of the screen at `speed` px/s: along x it is squeezed tall and thin and goes back the
   * other way, along y (the top; the bottom is the floor) it is squashed flat.
   */
  bump(axis, speed) {
    if (this.calm) return;
    const push = Math.min(SQUISH.maxBump, speed * SQUISH.bump);
    this.#stretchV += axis === 'x' ? push : -push;
    if (axis === 'x') this.#slide *= -SQUISH.bounce;
  }

  /** The popover it opened is on screen (`true`) or closed: it looks up at it. */
  lookUp(on) {
    this.#looking = on && !this.calm;
  }

  update(ms) {
    if (this.calm) return this.#rest();
    const dt = Math.min(ms / 1000, MAX_STEP);
    const looking = this.#looking && !this.held && !this.#pressed; // a hand on it is more important

    const stretchTarget = this.held ? SQUISH.held : this.#pressed ? SQUISH.press : looking ? SQUISH.look : 0;
    [this.stretch, this.#stretchV] = spring(this.stretch, this.#stretchV, stretchTarget, STRETCH_SPRING, dt);

    this.#speed *= Math.exp(-dt / SQUISH.speedFade);
    const swing = this.held ? this.#hang + clamp(this.#speed * SQUISH.leanPerPx, SQUISH.maxLean) : 0;
    const before = this.lean;
    [this.lean, this.#leanV] = spring(this.lean, this.#leanV, swing, this.held ? LEAN_SPRING : RIGHT_SPRING, dt);

    // Swung or turned over again and again, it gets dizzy (and it stays so for a while after it is let go).
    this.#agitation =
      this.#agitation * Math.exp(-dt / SQUISH.agitationFade) + (this.held ? Math.abs(this.lean - before) : 0);
    if (this.#agitation > SQUISH.dizzyAt) {
      this.#dizzyLeft = SQUISH.dizzyFor;
      this.#agitation = 0;
    }
    this.#dizzyLeft = Math.max(0, this.#dizzyLeft - dt);
    this.dizzy = Math.min(1, this.#dizzyLeft / SQUISH.dizzyFadeOut);
    this.#clock += dt;

    this.#slide *= Math.exp(-dt / SQUISH.slideFade);
    const sway = this.dizzy * SQUISH.dizzySway * Math.sin(this.#clock * 2 * Math.PI * SQUISH.dizzyHz);
    const skidTarget = clamp(this.#slide * SQUISH.skid, SQUISH.maxSkid) + sway;
    [this.skid, this.#skidV] = spring(this.skid, this.#skidV, skidTarget, SKID_SPRING, dt);

    [this.gaze, this.#gazeV] = spring(this.gaze, this.#gazeV, looking ? 1 : 0, GAZE_SPRING, dt);

    if (this.held) {
      [this.air, this.#airV] = spring(this.air, this.#airV, SQUISH.heldAir, AIR_SPRING, dt);
    } else if (this.air > 0 || this.#airV > 0) {
      this.#airV -= SQUISH.gravity * dt;
      this.air += this.#airV * dt;
      if (this.air <= 0) {
        const impact = -this.#airV;
        this.#landed = Math.max(this.#landed, impact);
        this.#stretchV -= impact * SQUISH.landing; // the harder it lands, the flatter it gets
        this.air = 0;
        this.#airV = 0;
      }
    }
  }

  #rest() {
    this.stretch = this.#stretchV = 0;
    this.lean = this.#leanV = 0;
    this.skid = this.#skidV = 0;
    this.gaze = this.#gazeV = 0;
    this.air = this.#airV = this.#speed = this.#slide = this.#hang = 0;
    this.dizzy = this.#agitation = this.#dizzyLeft = this.#landed = 0;
    this.held = this.#pressed = this.#looking = false;
  }
}
