const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { THROW, releaseVelocity, Slide, overhang, limitMove } = require('../src/main/ui/pet-throw');

const SIZE = { width: 288, height: 320 }; // the pet window
const SCREEN = { x: 0, y: 25, width: 1440, height: 875 }; // a work area

/** A cursor path at `vx` px/s to the right, one sample every 16 ms, ending at `now`. */
const path = (vx, now, ms = 160) =>
  Array.from({ length: ms / 16 + 1 }, (_, i) => {
    const t = now - ms + i * 16;
    return { t, x: 500 + (vx * (t - (now - ms))) / 1000, y: 300 };
  });

/** Runs a slide to its end in 16 ms steps over `areas`: where the window ended and for how long it slid. */
function run(slide, from = { x: 0, y: 0 }, areas = [{ x: -1e6, y: -1e6, width: 2e6, height: 2e6 }]) {
  const at = { ...from };
  let ms = 0;
  while (!slide.over && ms < 5000) {
    const next = limitMove(at, slide.step(0.016), SIZE, areas);
    slide.stop({ x: next.hitX, y: next.hitY });
    Object.assign(at, { x: next.x, y: next.y });
    ms += 16;
  }
  return { at, ms };
}

/** The top-left corner of a window whose feet are at (x, y). */
const withFeetAt = (x, y) => ({ x: x - SIZE.width / 2, y: y - SIZE.height + THROW.feetGap });

describe('letting the pet go while it moves', () => {
  test('the speed is that of the last 90 ms of the path; slower, stopped or too little path is no throw', () => {
    const v = releaseVelocity(path(1000, 10000), 10000);
    assert.ok(Math.abs(v.x - 1000) < 1 && v.y === 0);
    assert.equal(releaseVelocity(path(200, 10000), 10000), null, 'slower than minSpeed');
    assert.equal(releaseVelocity(path(1000, 10000), 10000 + 200), null, 'the hand stopped before it let go');
    assert.equal(releaseVelocity([{ t: 10000, x: 1, y: 1 }], 10000), null, 'one sample');
    assert.equal(releaseVelocity([], 10000), null);
    const diagonal = releaseVelocity(
      path(1000, 10000).map((p, i) => ({ ...p, y: 300 - i * 16 })),
      10000,
    );
    assert.ok(diagonal.y < 0 && diagonal.x > 0, 'it keeps the direction');
  });

  test('it slides about speed x fade and slows down: the harder the throw, the further it goes', () => {
    const slow = run(new Slide({ x: 800, y: 0 }));
    assert.ok(Math.abs(slow.at.x - 800 * THROW.fade) < 6, `slid ${slow.at.x}`);
    assert.equal(slow.at.y, 0);
    assert.ok(slow.ms < 1000, 'it comes to rest');

    const distances = [500, 1000, 2000, 4000].map((vx) => run(new Slide({ x: vx, y: 0 })).at.x);
    for (let i = 1; i < distances.length; i++) {
      assert.ok(Math.abs(distances[i] / distances[i - 1] - 2) < 0.1, `twice as fast, twice as far: ${distances}`);
    }
    assert.ok(distances[3] > 600, 'a hard throw crosses a good part of the screen');

    const left = run(new Slide({ x: -800, y: 0 }));
    assert.ok(left.at.x < 0);
  });

  test('a hand faster than maxSpeed throws no harder than maxSpeed', () => {
    const wild = releaseVelocity(path(30000, 10000, 96), 10000);
    assert.ok(Math.abs(Math.hypot(wild.x, wild.y) - THROW.maxSpeed) < 1);
    assert.ok(wild.x > 0 && wild.y === 0, 'same direction');
  });

  test('it never moves faster than it did on the way out', () => {
    const slide = new Slide({ x: 900, y: 0 });
    const steps = Array.from({ length: 10 }, () => slide.step(0.016).dx);
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i] < steps[i - 1]);
  });

  test('an edge stops it exactly on it, on that axis only, and it goes on along the other', () => {
    const from = withFeetAt(1300, 500);
    const { at } = run(new Slide({ x: 3000, y: -600 }), from, [SCREEN]);
    assert.ok(
      Math.abs(at.x + SIZE.width / 2 + THROW.edge - 1440) < 0.5,
      `feet end ${THROW.edge}px from the edge: ${at.x}`,
    );
    assert.ok(at.y < from.y - 20, 'still went up');
    assert.equal(overhang(at, SIZE, [SCREEN]), 0, 'and it is on the screen');
  });

  test('it is not thrown out of the top, nor below the bottom of the screen', () => {
    const up = run(new Slide({ x: 0, y: -5000 }), withFeetAt(700, 600), [SCREEN]).at;
    assert.ok(
      Math.abs(up.y + SIZE.height - THROW.feetGap - THROW.headRoom - SCREEN.y) < 0.5,
      'the head stops at the top',
    );
    const down = run(new Slide({ x: 0, y: 5000 }), withFeetAt(700, 500), [SCREEN]).at;
    assert.ok(
      Math.abs(down.y + SIZE.height - THROW.feetGap - (SCREEN.y + SCREEN.height)) < 0.5,
      'the feet on the floor',
    );
  });

  test('a window that is already outside is never pulled back, it only cannot go further out', () => {
    const outside = withFeetAt(1440 + 200, 500); // dragged off the right edge
    const out = limitMove(outside, { dx: 20, dy: 0 }, SIZE, [SCREEN]);
    assert.equal(out.x, outside.x);
    assert.ok(out.hitX);
    const back = limitMove(outside, { dx: -20, dy: 0 }, SIZE, [SCREEN]);
    assert.equal(back.x, outside.x - 20, 'moving back in is free');
    assert.ok(!back.hitX);
    const along = limitMove(outside, { dx: 0, dy: -20 }, SIZE, [SCREEN]);
    assert.equal(along.y, outside.y - 20, 'and so is moving along the edge');
  });

  test('it can be thrown from one screen to the one next to it, with no dead strip in between', () => {
    const next = { x: 1440, y: 0, width: 1920, height: 1080 };
    const { at } = run(new Slide({ x: 4000, y: 0 }), withFeetAt(1300, 500), [SCREEN, next]);
    assert.ok(at.x + SIZE.width / 2 > 1440 + 100, `it crossed: feet at ${at.x + SIZE.width / 2}`);
    assert.equal(overhang(at, SIZE, [SCREEN, next]), 0);
    for (const x of [1400, 1440, 1480]) assert.equal(overhang(withFeetAt(x, 500), SIZE, [SCREEN, next]), 0, `at ${x}`);
    const alone = run(new Slide({ x: 4000, y: 0 }), withFeetAt(1300, 500), [SCREEN]);
    assert.ok(alone.at.x + SIZE.width / 2 < 1440, 'with one screen it stops at the edge, as before');
  });

  test('it cannot be thrown into a gap between screens, but it can cross to a screen that is lower or higher', () => {
    const far = { x: 1700, y: 25, width: 1000, height: 875 }; // 260 px of nothing between the two
    const { at } = run(new Slide({ x: 4000, y: 0 }), withFeetAt(1300, 500), [SCREEN, far]);
    assert.ok(at.x + SIZE.width / 2 + THROW.edge <= 1440 + 0.5, 'it stops at the edge of the first one');

    const lower = { x: 1440, y: 400, width: 1000, height: 700 }; // starts 375 px below the top of the first
    const crossing = run(new Slide({ x: 4000, y: 0 }), withFeetAt(1300, 800), [SCREEN, lower]);
    assert.ok(crossing.at.x + SIZE.width / 2 > 1440 + 100, 'a throw at a height both screens have crosses');
    const blocked = run(new Slide({ x: 4000, y: 0 }), withFeetAt(1300, 540), [SCREEN, lower]);
    assert.ok(
      blocked.at.x + SIZE.width / 2 <= 1440 + 0.5,
      'where the other screen has no room above the feet, the head would hang in the void: it stops',
    );
  });
});
