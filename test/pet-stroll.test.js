const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '../src/renderer/shared/pet-stroll.js')).href);

/** Just what the stroller reads and writes of an animator; `tick` moves it one pixel the way a walker does. */
const fakePet = (over = {}) => ({
  x: 10,
  dir: 1,
  minX: -4,
  maxX: 24,
  walking: false,
  state: 'idle',
  setWalking(on) {
    this.walking = on;
  },
  tick() {
    if (this.walking) this.x += this.dir;
  },
  ...over,
});

/** A "random" source that gives the numbers in turn (then repeats the last one). */
const rng = (...values) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

/** Runs frames of `dt` ms until `done()` or `max` frames; returns how many it took. */
function run(stroller, pet, { dt = 16, max = 20000, options, done }) {
  let frames = 0;
  while (frames < max && !done()) {
    stroller.update(dt, pet, options);
    pet.tick();
    frames++;
  }
  return frames;
}

describe('Stroller', () => {
  test('waits between 20 and 60 seconds before the first stroll', async () => {
    const { Stroller, STROLL } = await load();
    const [min, max] = STROLL.every;
    for (const roll of [0, 1]) {
      const stroller = new Stroller(rng(roll, 0.5, 0.5));
      stroller.home = 10;
      const pet = fakePet();
      const frames = run(stroller, pet, { done: () => pet.walking });
      const ms = frames * 16;
      const wait = min + roll * (max - min);
      assert.ok(ms >= wait && ms < wait + 32, `waited ${ms} ms for a wait of ${wait}`);
    }
  });

  test('goes out up to its reach, comes back to where it stands and stops', async () => {
    const { Stroller } = await load();
    const stroller = new Stroller(rng(0, 0.99, 0.5)); // right side, near the longest reach
    stroller.home = 10;
    const pet = fakePet();
    run(stroller, pet, { done: () => pet.walking });
    let farthest = 0;
    let turned = false;
    run(stroller, pet, {
      done: () => !pet.walking,
      max: 5000,
      options: {},
    });
    // Replay to record the farthest point: same seed, same stroll.
    const again = new Stroller(rng(0, 0.99, 0.5));
    again.home = 10;
    const pet2 = fakePet();
    run(again, pet2, { done: () => pet2.walking });
    run(again, pet2, {
      done: () => {
        farthest = Math.max(farthest, pet2.x - 10);
        turned ||= pet2.dir === -1;
        return !pet2.walking;
      },
      max: 5000,
    });
    assert.equal(pet.x, 10, 'ends exactly where it stands');
    assert.equal(pet.walking, false);
    assert.ok(turned, 'turned around');
    assert.ok(farthest >= 6 && farthest <= 14, `went ${farthest} px out`);
  });

  test('never walks past the floor edges', async () => {
    const { Stroller } = await load();
    const stroller = new Stroller(rng(0, 0.99, 0.99)); // asks for the longest reach
    stroller.home = 10;
    const pet = fakePet({ minX: 6, maxX: 14 }); // 4 px of room on each side
    run(stroller, pet, { done: () => pet.walking });
    let min = pet.x;
    let max = pet.x;
    run(stroller, pet, {
      done: () => {
        min = Math.min(min, pet.x);
        max = Math.max(max, pet.x);
        return !pet.walking;
      },
      max: 5000,
    });
    assert.ok(min >= 6 && max <= 14, `walked between ${min} and ${max}`);
  });

  test('a floor with no room on either side gives no strolls', async () => {
    const { Stroller } = await load();
    const stroller = new Stroller(rng(0));
    stroller.home = 10;
    const pet = fakePet({ minX: 9, maxX: 11 });
    run(stroller, pet, { max: 6000, done: () => pet.walking }); // far longer than the wait
    assert.equal(pet.walking, false);
  });

  test('calm mode (Do not disturb, Reduce Motion) never walks, and ends a stroll at home', async () => {
    const { Stroller } = await load();
    const stroller = new Stroller(rng(0));
    stroller.home = 10;
    const calm = fakePet();
    run(stroller, calm, { max: 6000, options: { calm: true }, done: () => calm.walking });
    assert.equal(calm.walking, false);

    const pet = fakePet();
    run(stroller, pet, { done: () => pet.walking });
    run(stroller, pet, { max: 3, done: () => false }); // a few pixels into the stroll
    assert.notEqual(pet.x, 10);
    stroller.update(16, pet, { calm: true });
    assert.deepEqual([pet.walking, pet.x], [false, 10]);
  });

  test('holding the pet stops it where it is; letting go carries on and it still gets home', async () => {
    const { Stroller } = await load();
    const stroller = new Stroller(rng(0, 0.99, 0.5));
    stroller.home = 10;
    const pet = fakePet();
    run(stroller, pet, { done: () => pet.walking });
    run(stroller, pet, { max: 20, done: () => false });
    stroller.update(16, pet, { still: true });
    const heldAt = pet.x;
    assert.equal(pet.walking, false);
    for (let i = 0; i < 100; i++) {
      stroller.update(16, pet, { still: true });
      pet.tick();
    }
    assert.equal(pet.x, heldAt, 'did not move while held');
    run(stroller, pet, { done: () => !pet.walking && !stroller.walking, max: 5000 });
    assert.equal(pet.x, 10);
  });

  test('a pet that was moved away from home walks back at once', async () => {
    const { Stroller } = await load();
    const stroller = new Stroller(rng(0.9));
    stroller.home = 10;
    const pet = fakePet({ x: 15 });
    stroller.update(16, pet, {});
    assert.equal(pet.walking, true);
    assert.equal(pet.dir, -1);
    run(stroller, pet, { done: () => !pet.walking, max: 100 });
    assert.equal(pet.x, 10);
  });

  test('waits while the pet cheers', async () => {
    const { Stroller } = await load();
    const stroller = new Stroller(rng(0));
    stroller.home = 10;
    const pet = fakePet({ state: 'cheer' });
    run(stroller, pet, { max: 6000, done: () => pet.walking });
    assert.equal(pet.walking, false);
  });
});
