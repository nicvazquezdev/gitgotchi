// A caress: the pointer goes back and forth over the pet without pressing, a few times in a row. Pure rules (no DOM, no
// timers): the host feeds it the x of every mouse move over the pet and asks whether it adds up to a caress.

export const CARESS = {
  stroke: 14, // px the pointer must travel one way before coming back for it to count as a stroke
  strokes: 4, // turns of direction (so five passes) within `within` ms
  within: 1600, // ms
  rest: 4000, // ms after a caress before the next one can start
};

export class Caress {
  #origin = null; // where the pointer was when it started (until it has gone one way)
  #direction = 0; // 1 or -1 once it is going one way
  #peak = 0; // the furthest it has got in that direction
  #turns = []; // times of the turns
  #quietUntil = 0;

  /** The pointer moved to `x` at `time` (ms). Returns true when it adds up to a caress. */
  move(x, time) {
    if (time < this.#quietUntil) return false;
    if (this.#origin === null) this.#origin = x;
    if (this.#direction === 0) {
      if (Math.abs(x - this.#origin) >= CARESS.stroke) {
        this.#direction = Math.sign(x - this.#origin);
        this.#peak = x;
      }
      return false;
    }
    if ((x - this.#peak) * this.#direction > 0) {
      this.#peak = x; // it goes on the same way
      return false;
    }
    if ((this.#peak - x) * this.#direction < CARESS.stroke) return false; // not back far enough yet
    this.#direction = -this.#direction; // it came back: that is a stroke
    this.#peak = x;
    this.#turns = [...this.#turns.filter((t) => time - t <= CARESS.within), time];
    if (this.#turns.length < CARESS.strokes) return false;
    this.reset();
    this.#quietUntil = time + CARESS.rest;
    return true;
  }

  /** The pointer left the pet, pressed it or the like: start over. */
  reset() {
    this.#origin = null;
    this.#direction = 0;
    this.#turns = [];
  }
}
