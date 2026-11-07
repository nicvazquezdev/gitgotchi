// Draws the pet sprites from assets/pets (see src/main/game/catalog.js for the metadata).
// Rules from the sprite set: nearest-neighbor scaling, the shadow is a separate layer that stays on the floor,
// and every stage is aligned on its shadow center so all stages stand on the same line.

const ASSETS = new URL('../../../assets/pets/', import.meta.url);

/** Native size of the pet box: fits the adult (48 px) plus room for the jump. CSS scales it. */
export const BOX = 52;
const GROUND = 50; // y of the floor inside the box, in native px

// Reference hop from the sprite set: 0, -1, -2, -1 px; the shadow shrinks and fades at the top.
const LIFT = [0, -1, -2, -1];
const SHADOW = [
  { scale: 1, alpha: 1 },
  { scale: 0.88, alpha: 0.8 },
  { scale: 0.76, alpha: 0.6 },
  { scale: 0.88, alpha: 0.8 },
];

// Motion per mood: which LIFT steps to cycle and how fast. Floating creatures always hover.
const MOTIONS = {
  happy: { steps: [0, 1, 2, 1], ms: 250 },
  idle: { steps: [0, 0, 1, 1], ms: 450 },
  sad: { steps: [0], ms: 800 },
  sleeping: { steps: [0], ms: 900 },
};
const FLOAT = { steps: [0, 1, 2, 1], ms: 450 };
const MOOD_FILTERS = { sad: 'saturate(0.6) brightness(0.92)', sleeping: 'saturate(0.8) brightness(0.8)' };

const images = new Map();

/** Cached image, or null while it is still loading (the animation loop redraws on the next frame). */
function image(file) {
  if (!images.has(file)) {
    const img = new Image();
    img.src = new URL(file, ASSETS).href;
    images.set(file, img);
  }
  const img = images.get(file);
  return img.complete && img.naturalWidth ? img : null;
}

const stageOf = (species, stageIndex) =>
  species.stages[Math.max(0, Math.min(species.stages.length - 1, stageIndex ?? 0))];

const motionFor = (stage, mood) => (stage.floats && mood !== 'sleeping' ? FLOAT : (MOTIONS[mood] ?? MOTIONS.idle));

/**
 * Where the sprite sits inside the box, in native px. Used for hit-testing (clicks only count on the pet).
 * @returns {{ x: number, y: number, size: number }}
 */
export function spriteRect(species, stageIndex) {
  const { size, shadowEllipse: e } = stageOf(species, stageIndex);
  return { x: Math.round(BOX / 2 - e.cx), y: Math.round(GROUND - e.cy), size };
}

/**
 * Draws one frame.
 * @param {HTMLCanvasElement} canvas
 * @param {{ species, stageIndex, mood, frame }} opts
 * @param {{ fit?: 'box' | 'sprite' }} [layout]  'box': aligned on the floor of the shared 52 px box (the pet window);
 *   'sprite': the canvas is just the sprite (thumbnails).
 */
export function drawPet(canvas, { species, stageIndex, mood, frame = 0 }, { fit = 'box' } = {}) {
  const stage = stageOf(species, stageIndex);
  const side = fit === 'box' ? BOX : stage.size;
  if (canvas.width !== side) canvas.width = canvas.height = side;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, side, side);

  const sprite = image(stage.file);
  const shadow = image(stage.shadow);
  if (!sprite || !shadow) return;

  const { steps } = motionFor(stage, mood);
  const step = steps[frame % steps.length];
  const { x, y } = fit === 'box' ? spriteRect(species, stageIndex) : { x: 0, y: 0 };
  const e = stage.shadowEllipse;

  // Shadow: stays on the floor, shrinks and fades around its center while the pet is up.
  ctx.save();
  ctx.globalAlpha = SHADOW[step].alpha;
  ctx.translate(x + e.cx, y + e.cy);
  ctx.scale(SHADOW[step].scale, SHADOW[step].scale);
  ctx.drawImage(shadow, -e.cx, -e.cy);
  ctx.restore();

  ctx.save();
  if (MOOD_FILTERS[mood]) ctx.filter = MOOD_FILTERS[mood];
  ctx.drawImage(sprite, x, y + LIFT[step]);
  ctx.restore();
}

/**
 * Animates a canvas. `getOptions()` is read on every frame, so state can change live.
 * @returns {() => void} stops the animation
 */
export function animatePet(canvas, getOptions, layout) {
  let frame = 0;
  let timer = null;
  const tick = () => {
    const opts = getOptions();
    if (opts) drawPet(canvas, { ...opts, frame: frame++ }, layout);
    const ms = opts ? motionFor(stageOf(opts.species, opts.stageIndex), opts.mood).ms : 500;
    timer = setTimeout(tick, ms);
  };
  tick();
  return () => clearTimeout(timer);
}
