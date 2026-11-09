const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const load = () => import(path.join(__dirname, '../src/renderer/shared/pet-squish.js'));

/** Steps `ms` in 16 ms frames, calling `each` after every one. */
function step(squish, ms, each = () => {}) {
  for (let t = 0; t < ms; t += 16) {
    squish.update(16);
    each();
  }
}

const rests = (s) => Math.abs(s.stretch) < 0.01 && Math.abs(s.lean) < 0.01 && s.air === 0;
const SQ_HOP_FROM_HELD = 3.5; // a bit over the 3 rows it hangs at

describe('how the pet answers the hand', () => {
  test('a press squashes it under the finger: squat and wide', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.press();
    step(s, 300);
    assert.ok(s.scaleY < 0.9 && s.scaleX > 1.05);
    assert.ok(s.busy);
  });

  test('a click boings: it squashes, hops, lands in a squash, wobbles and rests', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.press();
    step(s, 150);
    s.pop();
    let top = 0;
    let tall = 0;
    let flat = 1;
    let landed = false;
    step(s, 1000, () => {
      top = Math.max(top, s.air);
      tall = Math.max(tall, s.scaleY);
      if (s.air === 0 && top > 0) {
        landed = true;
        flat = Math.min(flat, s.scaleY);
      }
    });
    assert.ok(top >= 2 && top <= 4, 'it hops a few rows');
    assert.ok(tall > 1.03, 'it stretches as it goes up');
    assert.ok(landed && flat < 0.97, 'it squashes when it lands');
    assert.ok(rests(s) && !s.busy, 'and it comes to rest');
  });

  test('spamming clicks does not make it climb: a click in the air only boings again', async () => {
    const { Squish } = await load();
    const s = new Squish();
    let top = 0;
    for (let i = 0; i < 20; i++) {
      s.press();
      step(s, 64);
      s.pop();
      step(s, 160, () => (top = Math.max(top, s.air)));
    }
    assert.ok(top <= 4, `it never went higher than ${top} rows`);
    assert.ok(Number.isFinite(s.stretch));
  });

  test('picked up, it hangs off the floor a little taller, swings with the cursor and bounces when dropped', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.press();
    step(s, 100);
    s.pickUp();
    step(s, 500);
    assert.ok(s.held && Math.abs(s.air - 3) < 0.1 && s.scaleY > 1.05);

    let swing = 0;
    for (let i = 0; i < 25; i++) {
      s.drag(10, 16); // 625 px/s to the right
      s.update(16);
      swing = Math.max(swing, s.lean);
    }
    assert.ok(swing > 0.2 && swing <= 0.5, 'the feet trail to the left, up to a limit');
    step(s, 600);
    assert.ok(Math.abs(s.lean) < 0.05, 'the cursor stopped: it hangs straight again');

    s.drop();
    let landed = false;
    let flat = 1;
    step(s, 1000, () => {
      if (s.air === 0) {
        landed = true;
        flat = Math.min(flat, s.scaleY);
      }
    });
    assert.ok(landed && flat < 0.97, 'it lands in a squash');
    assert.ok(rests(s));
  });

  test('swinging to the other side when the cursor goes left', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.pickUp();
    let swing = 0;
    for (let i = 0; i < 25; i++) {
      s.drag(-10, 16);
      s.update(16);
      swing = Math.min(swing, s.lean);
    }
    assert.ok(swing < -0.2);
  });

  test('a long pause does not blow the springs up', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.pop();
    s.update(60000);
    s.update(16);
    assert.ok(Math.abs(s.stretch) < 1 && s.air < 10);
  });

  test('it hangs from where it was grabbed: by the head straight, by the feet upside down, by a side sideways', async () => {
    const { Squish } = await load();
    const hangs = async (toCenter) => {
      const s = new Squish();
      s.pickUp(toCenter);
      step(s, 2500);
      return s.lean;
    };
    assert.ok(Math.abs(await hangs({ x: 0, y: 0.4 })) < 0.02, 'head: the center is below');
    assert.ok(Math.abs(Math.abs(await hangs({ x: 0.01, y: -0.4 })) - Math.PI) < 0.05, 'feet: the center is above');
    assert.ok(Math.abs((await hangs({ x: 0.4, y: 0 })) - Math.PI / 2) < 0.05, 'the left side: it hangs on its side');
    assert.ok(Math.abs((await hangs({ x: -0.4, y: 0 })) + Math.PI / 2) < 0.05, 'the right side, the other way');
    assert.ok(Math.abs(await hangs({ x: 0.05, y: -0.05 })) < 0.02, 'the belly: not tipped over');
    assert.ok(Math.abs(await hangs()) < 0.02, 'no grab point: straight');
  });

  test('held by the feet it turns over with a wobble, and when let go it hops, rights itself and lands', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.pickUp({ x: 0.01, y: -0.4 });
    let top = 0;
    step(s, 1500, () => (top = Math.max(top, s.lean)));
    assert.ok(top > Math.PI, 'it swings past upside down before it settles');

    s.drop();
    let hop = 0;
    step(s, 2000, () => (hop = Math.max(hop, s.air)));
    assert.ok(hop > SQ_HOP_FROM_HELD, 'it hops to have the time to turn over');
    assert.ok(rests(s), 'upright and at rest');
  });

  test('let go while the hand was fast it skids forward and comes back; let go slowly it does not', async () => {
    const { Squish } = await load();
    const fast = new Squish();
    fast.pickUp();
    for (let i = 0; i < 20; i++) {
      fast.drag(16, 16); // 1000 px/s to the right
      fast.update(16);
    }
    fast.drop();
    let lean = 0;
    step(fast, 300, () => (lean = Math.max(lean, fast.skid)));
    assert.ok(lean > 0.1 && lean <= 0.3, `forward lean ${lean}`);
    step(fast, 1500);
    assert.ok(Math.abs(fast.skid) < 0.01, 'and it stands straight again');

    const slow = new Squish();
    slow.pickUp();
    for (let i = 0; i < 20; i++) {
      slow.drag(3, 16); // under 200 px/s: no slide in the window either
      slow.update(16);
    }
    slow.drop();
    step(slow, 300, () => assert.ok(Math.abs(slow.skid) < 0.001));

    const left = new Squish();
    left.pickUp();
    for (let i = 0; i < 20; i++) {
      left.drag(-16, 16);
      left.update(16);
    }
    left.drop();
    let back = 0;
    step(left, 300, () => (back = Math.min(back, left.skid)));
    assert.ok(back < -0.1, 'to the left it leans to the left');
  });

  test('it looks up for as long as the popover is open, and a hand on it comes first', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.lookUp(true);
    step(s, 800);
    assert.ok(Math.abs(s.gaze - 1) < 0.02 && s.stretch > 0.04 && s.busy);
    step(s, 3000);
    assert.ok(Math.abs(s.gaze - 1) < 0.02, 'it stays looking up');

    s.press();
    step(s, 400);
    assert.ok(s.gaze < 0.05 && s.stretch < 0, 'pressed: it squashes instead');
    s.pop();
    step(s, 1000);
    assert.ok(Math.abs(s.gaze - 1) < 0.05, 'and goes back to looking at the popover');

    s.lookUp(false);
    step(s, 1000);
    assert.ok(s.gaze < 0.02 && Math.abs(s.stretch) < 0.01 && !s.busy, 'the popover closed: it relaxes');
  });

  test('calm mode: no reaction at all, and a reaction in progress ends', async () => {
    const { Squish } = await load();
    const s = new Squish();
    s.calm = true;
    s.press();
    s.pickUp();
    s.pop();
    step(s, 300);
    assert.ok(!s.held && !s.busy && s.scaleX === 1 && s.scaleY === 1 && s.air === 0);

    const live = new Squish();
    live.pop();
    step(live, 100);
    assert.ok(live.air > 0);
    live.calm = true;
    live.update(16);
    assert.ok(rests(live) && live.scaleY === 1);
  });
});
