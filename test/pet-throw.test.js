const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { THROW, releaseVelocity, Slide, Lowering, overhang, limitMove } = require('../src/main/ui/pet-throw');

const SIZE = { width: 288, height: 320 }; // the pet window
const SCREEN = { x: 0, y: 25, width: 1440, height: 875 }; // a work area

/** A cursor path at `vx` px/s to the right, one sample every 16 ms, ending at `now`. */
const path = (vx, now, ms = 160) =>
  Array.from({ length: ms / 16 + 1 }, (_, i) => {
    const t = now - ms + i * 16;
    return { t, x: 500 + (vx * (t - (now - ms))) / 1000, y: 300 };
  });

/**
 * Runs a slide to its end in 16 ms steps over `areas`, the way pet-window.js does: where the window ended, for how long
 * it slid and the hits against edges ({ axis, speed }). `keep`: the share of its speed it keeps off a wall or the top
 * (the bottom is the floor: it stops); 0 stops it at any edge.
 */
function run(slide, from = { x: 0, y: 0 }, areas = [{ x: -1e6, y: -1e6, width: 2e6, height: 2e6 }], keep = 0) {
  const at = { ...from };
  const hits = [];
  let ms = 0;
  while (!slide.over && ms < 8000) {
    const move = slide.step(0.016);
    const next = limitMove(at, move, SIZE, areas);
    if (next.hitX) hits.push({ axis: 'x', speed: slide.bounce('x', keep) });
    if (next.hitY) hits.push({ axis: 'y', speed: slide.bounce('y', move.dy > 0 ? 0 : keep) });
    Object.assign(at, { x: next.x, y: next.y });
    ms += 16;
  }
  return { at, ms, hits };
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
  test('it bounces off a wall with part of its speed, and tells how hard it hit', () => {
    const wall = { x: 0, y: 25, width: 1440, height: 875 };
    const from = withFeetAt(1100, 500);
    const { at, hits } = run(new Slide({ x: 3000, y: 0 }), from, [wall], THROW.bounce);
    const first = hits[0];
    assert.equal(first.axis, 'x');
    assert.ok(first.speed > THROW.bumpMin, `a hard hit: ${first.speed}`);
    assert.ok(at.x + SIZE.width / 2 < 1440 - THROW.edge - 20, 'it came back from the wall');
    assert.ok(hits.length >= 1 && hits.length <= 4, `a few bounces, not a buzz: ${hits.length}`);
    assert.ok(
      hits.every((hit, i) => i === 0 || hit.speed < hits[i - 1].speed),
      'each softer than the last',
    );

    const stopped = run(new Slide({ x: 3000, y: 0 }), from, [wall], 0);
    assert.ok(stopped.at.x + SIZE.width / 2 > 1440 - THROW.edge - 1, 'with no bounce it stays at the wall');
  });

  test('the bottom of the screen is the floor: it lands and stays, only the top and the walls bounce it', () => {
    const wall = { x: 0, y: 25, width: 1440, height: 875 };
    const down = run(new Slide({ x: 0, y: 3000 }), withFeetAt(700, 600), [wall], THROW.bounce);
    assert.equal(down.hits.length, 1, 'one landing');
    assert.ok(Math.abs(down.at.y + SIZE.height - THROW.feetGap - 900) < 1, 'and it stays on the floor');
    const up = run(new Slide({ x: 0, y: -5000 }), withFeetAt(700, 700), [wall], THROW.bounce);
    assert.ok(up.hits.length >= 1 && up.hits[0].axis === 'y');
    assert.ok(up.at.y + SIZE.height - THROW.feetGap - THROW.headRoom > 25 + 5, 'it came back down from the top');
  });

  test('the lowering of the window goes down fast and comes back more slowly', () => {
    const l = new Lowering();
    l.target = 200;
    l.step(0.05);
    const down = l.value;
    assert.ok(down > 100 && down < 200, `a good part of the way in 50 ms: ${down}`);
    for (let i = 0; i < 20; i++) l.step(0.016);
    assert.equal(l.value, 200, 'it arrives (it snaps the last quarter pixel)');
    l.target = 0;
    l.step(0.05);
    const back = 200 - l.value;
    assert.ok(back < down * 0.7, `coming back is slower: ${back} vs ${down}`);
    for (let i = 0; i < 80; i++) l.step(0.016);
    assert.equal(l.value, 0);
  });
});
