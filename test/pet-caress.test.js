const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '../src/renderer/shared/pet-caress.js')).href);

/** Strokes `n` times back and forth over `width` px, one mouse move every 16 ms from `start`; true when it is a caress. */
async function stroke({ n, width = 40, start = 0, caress }) {
  const { Caress } = await load();
  const c = caress ?? new Caress();
  let t = start;
  let x = 100;
  let done = false;
  for (let leg = 0; leg < n; leg++) {
    const dir = leg % 2 === 0 ? 1 : -1;
    for (let i = 0; i < width / 4; i++) {
      x += dir * 4;
      t += 16;
      done = c.move(x, t) || done;
    }
  }
  return { c, done, t };
}

describe('caresses', () => {
  test('going back and forth over the pet a few times is a caress', async () => {
    const { done } = await stroke({ n: 6 });
    assert.equal(done, true);
  });

  test('one pass, or a couple, is just the mouse going by', async () => {
    assert.equal((await stroke({ n: 1 })).done, false);
    assert.equal((await stroke({ n: 3 })).done, false);
  });

  test('tiny jiggles do not count, and neither does going one way slowly', async () => {
    assert.equal((await stroke({ n: 10, width: 8 })).done, false, 'the pointer shakes a few pixels');
    assert.equal((await stroke({ n: 1, width: 400 })).done, false, 'one long way');
  });

  test('too slow is not a caress: the strokes must come close together', async () => {
    const { Caress } = await load();
    const c = new Caress();
    let t = 0;
    let done = false;
    for (let i = 0; i < 12; i++) {
      t += 900; // a stroke every 0.9 s
      done = c.move(100 + (i % 2) * 40, t) || done;
    }
    assert.equal(done, false);
  });

  test('after a caress it rests: the next one cannot start right away, and leaving the pet starts over', async () => {
    const first = await stroke({ n: 6 });
    assert.equal(first.done, true);
    const again = await stroke({ n: 6, start: first.t + 50, caress: first.c });
    assert.equal(again.done, false, 'still resting');
    const later = await stroke({ n: 6, start: first.t + 6000, caress: first.c });
    assert.equal(later.done, true, 'and a while later it works again');

    const { Caress } = await load();
    const c = new Caress();
    await stroke({ n: 3, caress: c });
    c.reset(); // the pointer left the pet
    assert.equal(
      (await stroke({ n: 3, start: 100000, caress: c })).done,
      false,
      'the strokes before did not carry over',
    );
  });
});
