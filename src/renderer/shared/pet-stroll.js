// When the pet takes a short walk: a stroll every 20 to 60 seconds that goes out a few pixels and comes back to
// where the pet stands. Pure rules (no DOM, no timers): the host calls `update` on every frame.

export const STROLL = {
  every: [20000, 60000], // ms between strolls
  reach: [6, 14], // how far out a stroll goes, in native px (limited by the room the floor leaves)
  minRoom: 3, // a side with less room than this is not worth a stroll
};

/**
 * What the stroller needs from the animator: `x`, `dir`, `minX`, `maxX`, `walking`, `state`, `setWalking(bool)`.
 * `home` is where the pet stands when it is not walking (the host sets it when the canvas is laid out).
 */
export class Stroller {
  home = 0;
  #rng;
  #wait;
  #leg = null; // { dir, reach, phase: 'out' | 'back' } while a stroll is on

  constructor(rng = Math.random) {
    this.#rng = rng;
    this.#wait = this.#delay();
  }

  #delay() {
    const [min, max] = STROLL.every;
    return min + this.#rng() * (max - min);
  }

  get walking() {
    return this.#leg !== null;
  }

  /**
   * Advances the stroll by `dt` ms.
   * `calm`: no walking at all (Do not disturb, Reduce Motion): a stroll in progress ends and the pet goes home.
   * `still`: the user is holding or pointing at the pet: it stops where it is and goes on later.
   */
  update(dt, pet, { calm = false, still = false } = {}) {
    if (calm) return this.stop(pet);
    if (pet.state === 'cheer' || pet.state === 'landing') return; // the animator pauses the walk by itself
    if (still) {
      if (pet.walking) pet.setWalking(false);
      return;
    }
    if (!this.#leg) {
      if (pet.x !== this.home) return this.#start(pet, Math.sign(this.home - pet.x), 'back'); // back to the spot
      this.#wait -= dt;
      if (this.#wait <= 0) this.#begin(pet);
      return;
    }
    if (!pet.walking) pet.setWalking(true); // the user let go: carry on
    this.#advance(pet);
  }

  /** Ends the stroll at once and puts the pet back home. */
  stop(pet) {
    if (!this.#leg && pet.x === this.home && !pet.walking) return;
    this.#leg = null;
    pet.setWalking(false);
    pet.x = this.home;
  }

  #begin(pet) {
    const room = { [-1]: this.home - pet.minX, 1: pet.maxX - this.home };
    const sides = [-1, 1].filter((dir) => room[dir] >= STROLL.minRoom);
    this.#wait = this.#delay();
    if (!sides.length) return;
    const dir = sides[Math.floor(this.#rng() * sides.length)];
    const [min, max] = STROLL.reach;
    const reach = Math.min(room[dir], Math.round(min + this.#rng() * (max - min)));
    this.#start(pet, dir, 'out', reach);
  }

  #start(pet, dir, phase, reach = 0) {
    this.#leg = { dir, reach, phase };
    pet.dir = dir;
    pet.setWalking(true);
  }

  #advance(pet) {
    const leg = this.#leg;
    const out = (pet.x - this.home) * leg.dir; // how far from home, on the side the stroll went to
    if (leg.phase === 'out' && out >= leg.reach) {
      leg.phase = 'back';
      leg.dir = -leg.dir;
      pet.dir = leg.dir;
    } else if (leg.phase === 'back' && (pet.x - this.home) * leg.dir >= 0) {
      this.#leg = null; // arrived (or passed it by a pixel: hoppers move two at a time)
      pet.setWalking(false);
      pet.x = this.home;
    }
  }
}
