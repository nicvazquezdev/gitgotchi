const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const animations = require('../assets/pets/animations.json');

const load = () => import(path.join(__dirname, '../src/renderer/shared/pet-sprites.js'));

/** A small seeded random source (the player's), so every run is the same. */
const seeded = (seed) => {
  let rs = seed;
  return () => {
    rs = (rs + 0x6d2b79f5) | 0;
    let t = Math.imul(rs ^ (rs >>> 15), 1 | rs);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** An animator for a line and stage, without images (the animation rules never read them). */
async function pet(lineId, stageIndex, { mood = 'neutral', seed = 1 } = {}) {
  const { DesktopPet } = await load();
  const line = animations.lines.find((l) => l.id === lineId);
  const fx = Object.fromEntries(Object.entries(animations.fx).map(([name, meta]) => [name, { ...meta, img: null }]));
  const animator = new DesktopPet({
    stage: line.stages[stageIndex],
    timing: animations.timing,
    frames: animations.frames,
    moods: animations.moods,
    sheet: null,
    shadow: null,
    fx,
    ambient: { ...fx[line.ambient.fx], fx: line.ambient.fx, img: null },
    rng: seeded(seed),
  });
  animator.setMood(mood);
  return animator;
}

/** Steps `ms` in 10 ms updates, calling `each` after every update. */
function step(animator, ms, each = () => {}) {
  for (let t = 0; t < ms; t += 10) {
    animator.update(10);
    each();
  }
}

describe('the animation rules', () => {
  test('a cheer plays cheer0-3 twice, lands for a moment, then goes back to idle', async () => {
    const a = await pet('phoenix', 0);
    const { cheer } = animations.timing;
    a.cheer();
    const seen = [];
    const total = cheer.ms.reduce((x, y) => x + y, 0) * cheer.repeat + cheer.landing;
    step(a, total + 50, () => seen.push(a.frameName));
    const cheerFrames = seen.filter((f) => f.startsWith('cheer'));
    assert.deepEqual([...new Set(cheerFrames)], ['cheer0', 'cheer1', 'cheer2', 'cheer3']);
    assert.ok(seen.includes('idle0'), 'lands on idle0');
    assert.equal(a.state, 'idle');
    // The jump leaves the ground, and the lift comes from the stage data.
    a.cheer();
    const lifts = new Set();
    step(a, 600, () => lifts.add(a.lift));
    assert.ok(Math.min(...lifts) <= -6, 'reaches the top of the jump');
  });

  test('a cheer bursts three hearts, then puffs of dust when it lands (none for a floater)', async () => {
    const walker = await pet('ram', 1);
    walker.cheer();
    assert.equal(walker.parts.filter((p) => p.kind === 'heart').length, 3);
    step(walker, 1400);
    assert.equal(walker.parts.filter((p) => p.kind === 'puff').length, 2);

    const floater = await pet('jelly', 0);
    floater.cheer();
    step(floater, 1400);
    assert.equal(floater.parts.filter((p) => p.kind === 'puff').length, 0);
  });

  test('a hopper only travels on the frames where it is in the air; a walker on every frame', async () => {
    const hopper = await pet('phoenix', 0); // motion: hop
    hopper.setFloor(-100, 100);
    hopper.setWalking(true);
    let airborneSteps = 0;
    let groundedSteps = 0;
    let last = hopper.x;
    step(hopper, 2000, () => {
      if (hopper.x !== last) hopper.lift < 0 ? airborneSteps++ : groundedSteps++;
      last = hopper.x;
    });
    assert.ok(airborneSteps > 0, 'it moved');
    assert.equal(groundedSteps, 0, 'never on the ground');

    const walker = await pet('ram', 1); // motion: walk
    walker.setFloor(-100, 100);
    walker.setWalking(true);
    step(walker, 1000);
    assert.ok(walker.x - 0 >= 6, 'a walker moves a pixel every frame');
  });

  test('a side-facing creature is mirrored when it walks the other way; a front-facing one never is', async () => {
    const facingLeft = await pet('ram', 1); // faces left
    facingLeft.setFloor(-100, 100);
    facingLeft.dir = 1;
    facingLeft.setWalking(true);
    step(facingLeft, 300);
    assert.equal(facingLeft.flip, true, 'walking right: mirrored');
    facingLeft.dir = -1;
    step(facingLeft, 300);
    assert.equal(facingLeft.flip, false, 'walking left: as drawn');

    const front = await pet('phoenix', 0); // faces the front
    front.setFloor(-100, 100);
    front.setWalking(true);
    step(front, 600);
    assert.equal(front.flip, false);
  });

  test('the floor edges turn a walker around', async () => {
    const a = await pet('ram', 1);
    a.setFloor(0, 5);
    a.setWalking(true);
    let max = 0;
    step(a, 3000, () => (max = Math.max(max, a.x)));
    assert.equal(max, 5);
    assert.ok(a.x <= 5 && a.x >= 0);
  });

  test('a happy pet does not throw hearts and sparkles by itself: they are a burst that rejoice() starts', async () => {
    const kinds = (a) => a.parts.map((p) => p.kind);
    const happy = await pet('moth', 2, { mood: 'happy' });
    let seen = new Set();
    step(happy, 6000, () => kinds(happy).forEach((k) => seen.add(k)));
    assert.ok(!seen.has('heart') && !seen.has('sparkle'), 'a happy mood alone is quiet');

    happy.rejoice(3000);
    seen = new Set();
    step(happy, 3000, () => kinds(happy).forEach((k) => seen.add(k)));
    assert.ok(seen.has('heart') && seen.has('sparkle'), 'the burst has hearts and sparkles');

    step(happy, 2000); // the last ones fade (a heart lives 1150 ms)
    seen = new Set();
    step(happy, 6000, () => kinds(happy).forEach((k) => seen.add(k)));
    assert.ok(!seen.has('heart') && !seen.has('sparkle'), 'and it stops by itself');
    assert.equal(happy.mood, 'happy', 'the pet stays happy');
  });

  test('rejoice() only works for a happy pet that is not calm, and a mood change ends it', async () => {
    const neutral = await pet('moth', 2, { mood: 'neutral' });
    neutral.rejoice(3000);
    step(neutral, 3000);
    assert.ok(!neutral.parts.some((p) => p.kind === 'heart'));

    const calm = await pet('moth', 2, { mood: 'happy' });
    calm.calm = true;
    calm.rejoice(3000);
    assert.equal(calm.joyLeft, 0);

    const happy = await pet('moth', 2, { mood: 'happy' });
    happy.rejoice(60000);
    happy.setMood('neutral');
    happy.setMood('happy');
    let hearts = false;
    step(happy, 3000, () => (hearts ||= happy.parts.some((p) => p.kind === 'heart')));
    assert.ok(!hearts, 'a new mood starts quiet');
  });

  test('anxious pets sweat and shiver, and every line has ambient particles', async () => {
    const anxious = await pet('moth', 2, { mood: 'anxious' });
    assert.ok(anxious.sweat);
    let shivered = false;
    step(anxious, 5000, () => (shivered ||= anxious.shiver !== null));
    assert.ok(shivered);

    for (const line of animations.lines) {
      const a = await pet(line.id, 0);
      let spawned = false; // they live 1.3-1.9 s and come every 1.4-3 s: there are gaps with none on screen
      step(a, 6000, () => (spawned ||= a.parts.some((p) => p.kind === 'ambient')));
      assert.ok(spawned, `${line.id} has ambient particles`);
    }
  });

  test('calm mode: the idle loop only, no particles, no sweat, and a cheer does nothing', async () => {
    const a = await pet('moth', 2, { mood: 'happy' });
    a.calm = true;
    a.cheer();
    assert.equal(a.state, 'idle');
    step(a, 8000, () => {
      assert.equal(a.parts.length, 0);
    });
    a.setMood('anxious');
    step(a, 8000, () => {
      assert.equal(a.sweat, null);
      assert.equal(a.shiver, null);
    });
    a.calm = false;
    a.cheer();
    assert.equal(a.state, 'cheer');
  });

  test('held, a pet shows the arms-up pose, and hop lifts it off the ground rows at a time with its shadow', async () => {
    const a = await pet('ram', 1);
    const rest = a.lift;
    assert.ok(!a.frameName.startsWith('cheer'));
    a.held = true;
    assert.equal(a.frameName, 'cheer1');
    a.held = false;
    a.hop = 3;
    assert.equal(a.lift, rest - 3);
    a.hop = 0;
    assert.equal(a.lift, rest);
  });

  test('facingSign says which way the creature looks on the screen, mirrored or not; the front-facing never turns', async () => {
    const ram = await pet('ram', 1); // drawn facing left
    assert.equal(ram.facingSign, 1);
    ram.flip = true;
    assert.equal(ram.facingSign, -1);
    const front = await pet('phoenix', 0);
    assert.equal(front.facingSign, 0);
    front.flip = true;
    assert.equal(front.facingSign, 0);
  });

  test('landing dust: a puff at each side of the feet, twice for a hard landing; none for a floater or in calm mode', async () => {
    const puffs = (a) => a.parts.filter((p) => p.kind === 'puff');
    for (const [line, stage] of [
      ['ram', 1], // walks
      ['phoenix', 0], // hops
      ['stag', 0],
    ]) {
      const a = await pet(line, stage);
      a.dust();
      assert.equal(puffs(a).length, 2, `${line}: one each side`);
      const hard = await pet(line, stage);
      hard.dust(true);
      assert.equal(puffs(hard).length, 4, `${line}: a second round after the first`);
      step(hard, 1000);
      assert.equal(puffs(hard).length, 0, `${line}: and they are gone`);
    }
    // The pack gives no dust to the ones that float: they never touch the ground.
    for (const [line, stage] of [
      ['jelly', 0],
      ['koi', 2],
      ['moth', 1],
      ['phoenix', 3],
    ]) {
      const floater = await pet(line, stage);
      assert.equal(floater.motion, 'float', `${line} ${stage} floats`);
      floater.dust(true);
      floater.skidDust(1);
      floater.skidDust(-1);
      assert.equal(puffs(floater).length, 0, `${line}: no dust, only the squash`);
    }
    const calm = await pet('ram', 1);
    calm.calm = true;
    calm.dust(true);
    calm.skidDust(1);
    assert.equal(puffs(calm).length, 0);
  });

  test('skid dust: one puff behind the feet, on the side it comes from, mirrored with the creature', async () => {
    const a = await pet('ram', 1);
    const e = a.stage.shadowEllipse;
    a.skidDust(1); // going right: the dust is on the left
    a.skidDust(-1);
    const [behindRight, behindLeft] = a.parts.filter((p) => p.kind === 'puff');
    assert.equal(behindRight.side, -1);
    assert.equal(behindLeft.side, 1);
    assert.ok(behindRight.x < behindLeft.x, 'one at each end of the shadow');
    assert.equal(behindRight.y, Math.floor(e.cy));
    assert.equal(behindRight.mirror, false);
    assert.equal(behindLeft.mirror, true);
  });

  test('dizzy: the eyes half shut then shut and a pixel of sway, but a held pet keeps its pose', async () => {
    const a = await pet('moth', 2);
    const normal = new Set();
    step(a, 400, () => normal.add(a.frameName));
    assert.ok(![...normal].some((f) => f === 'blink'), 'not dizzy: it does not blink on end');
    a.woozy = true;
    const frames = new Set();
    const sway = new Set();
    step(a, 1000, () => {
      frames.add(a.frameName);
      sway.add(a._shiverX());
    });
    assert.deepEqual([...frames].sort(), ['blink', 'half']);
    assert.deepEqual([...sway].sort(), [-1, 1]);
    a.held = true;
    assert.equal(a.frameName, 'cheer1');
  });

  test('a host that draws the body tilted can draw the shadow apart: draw() leaves it out, drawShadow() is only it', async () => {
    const a = await pet('moth', 2);
    Object.assign(a, { sheet: 'SHEET', shadowImg: 'SHADOW' });
    const drawn = [];
    const ctx = { save() {}, restore() {}, translate() {}, scale() {}, drawImage: (image) => drawn.push(image) };
    a.draw(ctx, 4, 0, 0);
    assert.equal(drawn[0], 'SHADOW', 'by default the shadow comes first, then the body');
    assert.ok(drawn.includes('SHEET'));

    drawn.length = 0;
    a.shadowApart = true;
    a.draw(ctx, 4, 0, 0);
    assert.ok(!drawn.includes('SHADOW') && drawn.includes('SHEET'), 'apart: only the body');

    drawn.length = 0;
    a.drawShadow(ctx, 4, 0, 0);
    assert.deepEqual(drawn, ['SHADOW'], 'and the shadow alone on its own');
  });

  test('the animation is the same on every run with the same random seed', async () => {
    const record = async () => {
      const a = await pet('koi', 3, { mood: 'anxious', seed: 7 });
      a.setWalking(true);
      a.setFloor(-4, 20);
      const out = [];
      step(a, 4000, () => out.push([a.frameName, a.x, a.lift, a.parts.length]));
      return JSON.stringify(out);
    };
    assert.equal(await record(), await record());
  });
});
