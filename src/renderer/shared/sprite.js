// Draws a creature's static sprite with a small hop, for thumbnails (the profile portrait): the rest pose from
// assets/pets (see src/main/game/catalog.js for the metadata) over its shadow, which is a separate layer that stays
// on the floor. The desktop pet uses the real animations instead (pet/pet-view.js).

const ASSETS = new URL('../../../assets/pets/', import.meta.url);

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
  neutral: { steps: [0, 0, 1, 1], ms: 450 },
  anxious: { steps: [0, 1], ms: 200 }, // fidgety
};
const FLOAT = { steps: [0, 1, 2, 1], ms: 450 };

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

const motionFor = (stage, mood) => (stage.floats ? FLOAT : (MOTIONS[mood] ?? MOTIONS.neutral));

/**
 * Draws one frame; the canvas is just the sprite.
 * @param {HTMLCanvasElement} canvas
 * @param {{ species, stageIndex, mood, frame }} opts
 */
export function drawPet(canvas, { species, stageIndex, mood, frame = 0 }) {
  const stage = stageOf(species, stageIndex);
  const side = stage.size;
  if (canvas.width !== side) canvas.width = canvas.height = side;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, side, side);

  const sprite = image(stage.file);
  const shadow = image(stage.shadow);
  if (!sprite || !shadow) return;

  const { steps } = motionFor(stage, mood);
  const step = steps[frame % steps.length];
  const e = stage.shadowEllipse;

  // Shadow: stays on the floor, shrinks and fades around its center while the pet is up.
  ctx.save();
  ctx.globalAlpha = SHADOW[step].alpha;
  ctx.translate(e.cx, e.cy);
  ctx.scale(SHADOW[step].scale, SHADOW[step].scale);
  ctx.drawImage(shadow, -e.cx, -e.cy);
  ctx.restore();

  ctx.drawImage(sprite, 0, LIFT[step]);
}

/**
 * Animates a canvas. `getOptions()` is read on every frame, so state can change live.
 * @returns {() => void} stops the animation
 */
export function animatePet(canvas, getOptions) {
  let frame = 0;
  let timer = null;
  const tick = () => {
    const opts = getOptions();
    if (opts) drawPet(canvas, { ...opts, frame: frame++ });
    const ms = opts ? motionFor(stageOf(opts.species, opts.stageIndex), opts.mood).ms : 500;
    timer = setTimeout(tick, ms);
  };
  tick();
  return () => clearTimeout(timer);
}
