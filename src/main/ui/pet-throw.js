// What happens when the pet is let go while it is still moving: it keeps going for a moment and slows down, like
// something sliding on the floor. Pure rules (no Electron, no timers): pet-window.js feeds it the path of the cursor
// while dragging and steps the slide with the time.

const THROW = {
  window: 90, // ms of the path of the cursor that count as how fast the hand was going when it let go
  minSpeed: 350, // px/s: slower than this, the pet stays where it was let go
  maxSpeed: 6000, // px/s: a faster hand (or a glitch of the cursor) throws it no harder than this
  fade: 0.16, // s for the speed to fall to 1/e: it slides about speed x fade px. Keep in sync with SQUISH.slideFade
  stopSpeed: 25, // px/s: below this the slide is over
  edge: 48, // px on each side of the pet's feet that must be on a screen (the window itself is mostly empty)
  feetGap: 12, // px from the bottom of the window to the feet of the pet
  headRoom: 160, // px above the feet that must be on a screen too: it is not thrown out of the top
};

/**
 * Velocity { x, y } in px/s of the cursor over the last `THROW.window` ms of `trail` ([{ t, x, y }], oldest first), or
 * null when it was slower than `minSpeed` (or had stopped: the path is old, or there is hardly any).
 */
function releaseVelocity(trail, now) {
  const recent = trail.filter((p) => now - p.t <= THROW.window);
  if (recent.length < 2) return null;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const seconds = (last.t - first.t) / 1000;
  if (seconds <= 0) return null;
  const velocity = { x: (last.x - first.x) / seconds, y: (last.y - first.y) / seconds };
  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < THROW.minSpeed) return null;
  const k = Math.min(1, THROW.maxSpeed / speed);
  return { x: velocity.x * k, y: velocity.y * k };
}

/** A slide that starts at `velocity` (px/s) and slows down on its own: twice as fast goes twice as far. */
class Slide {
  #vx;
  #vy;

  constructor({ x, y }) {
    this.#vx = x;
    this.#vy = y;
  }

  get speed() {
    return Math.hypot(this.#vx, this.#vy);
  }

  get over() {
    return this.speed < THROW.stopSpeed;
  }

  /** Moves on by `seconds`: how far it went, { dx, dy } in px. */
  step(seconds) {
    const keep = Math.exp(-seconds / THROW.fade);
    const travel = THROW.fade * (1 - keep); // the integral of the speed over the step, for a speed of 1
    const move = { dx: this.#vx * travel, dy: this.#vy * travel };
    this.#vx *= keep;
    this.#vy *= keep;
    return move;
  }

  /** The window met an edge: it stops on that axis (and goes on along the other one). */
  stop({ x = false, y = false }) {
    if (x) this.#vx = 0;
    if (y) this.#vy = 0;
  }
}

/** Distance in px from the point to the rectangle (0 when it is inside). */
function distanceTo({ x, y }, area) {
  return Math.hypot(
    Math.max(area.x - x, 0, x - (area.x + area.width)),
    Math.max(area.y - y, 0, y - (area.y + area.height)),
  );
}

/**
 * How far a window with its top-left corner at `pos` is from a place where the pet may be: 0 when its feet, a bit to
 * each side of them and a head above them are all on a screen (`areas`: the work areas of all of them). Next to
 * another screen there is no dead strip at the edge, because the other screen counts as well.
 */
function overhang(pos, { width, height }, areas) {
  const feet = { x: pos.x + width / 2, y: pos.y + height - THROW.feetGap };
  const probes = [
    feet,
    { x: feet.x - THROW.edge, y: feet.y },
    { x: feet.x + THROW.edge, y: feet.y },
    { x: feet.x, y: feet.y - THROW.headRoom },
  ];
  return probes.reduce((sum, probe) => sum + Math.min(...areas.map((area) => distanceTo(probe, area))), 0);
}

/**
 * Moves the window at `pos` by `delta`, but never further from the screens than it is: it can cross from one screen to
 * the next, it stops at the outer edge (exactly on it, not a step before) and it cannot enter a gap between screens.
 * A window that is already outside is not pulled back; it only cannot go further out. `hitX`/`hitY`: an edge stopped
 * that axis (the other goes on).
 */
function limitMove(pos, { dx, dy }, size, areas) {
  const worst = overhang(pos, size, areas);
  const fits = (p) => overhang(p, size, areas) <= worst + 0.01;
  const reach = (at) => {
    if (fits(at(1))) return 1;
    let [lo, hi] = [0, 1];
    for (let i = 0; i < 10; i++) {
      const mid = (lo + hi) / 2;
      if (fits(at(mid))) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const tx = reach((t) => ({ x: pos.x + dx * t, y: pos.y }));
  const ty = reach((t) => ({ x: pos.x, y: pos.y + dy * t }));
  let next = { x: pos.x + dx * tx, y: pos.y + dy * ty };
  if (!fits(next)) next = Math.abs(dx * tx) >= Math.abs(dy * ty) ? { x: next.x, y: pos.y } : { x: pos.x, y: next.y }; // a corner
  return { ...next, hitX: Math.abs(next.x - (pos.x + dx)) > 0.01, hitY: Math.abs(next.y - (pos.y + dy)) > 0.01 };
}

module.exports = { THROW, releaseVelocity, Slide, overhang, limitMove };
