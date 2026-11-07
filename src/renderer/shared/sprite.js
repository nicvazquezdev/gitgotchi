// Pet sprites. For now these are code-generated pixel art placeholders (32x32);
// when the real sprites arrive, replace `drawPet` keeping the same signature.
const N = 32;
const OUTLINE = '#1b1530';
const EYE = '#1b1530';
const GOLD = '#fde047';
// Animation speed per mood.
const FRAME_MS = { happy: 300, idle: 550, sad: 700, sleeping: 900 };

const grid = () => Array.from({ length: N }, () => Array(N).fill(null));
const set = (g, x, y, c) => {
  if (x >= 0 && y >= 0 && x < N && y < N) g[y][x] = c;
};

function ellipse(g, cx, cy, rx, ry, colorAt) {
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) set(g, x, y, colorAt(x, y));
    }
}

function rect(g, x0, y0, w, h, colorAt) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(g, x, y, colorAt(x, y));
}

// Upward triangle with its tip at (x, top).
function spike(g, x, top, h, c) {
  for (let k = 0; k < h; k++) for (let i = -Math.floor(k / 2); i <= Math.floor(k / 2); i++) set(g, x + i, top + k, c);
}

function outline(g) {
  const out = grid();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (g[y][x]) continue;
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => g[y + dy]?.[x + dx]);
      if (near) out[y][x] = OUTLINE;
    }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (out[y][x]) g[y][x] = out[y][x];
}

function drawEgg(g, { species, frame, progress }) {
  const p = species.palette;
  const wobble = frame % 4 === 1 ? 1 : frame % 4 === 3 ? -1 : 0;
  const cx = 16 + wobble;
  const cy = 20;
  ellipse(g, cx, cy, 7, 9, (x, y) => (x > cx + 2 && y > cy ? '#d8cfbf' : '#f5f0e6'));
  outline(g);
  // Spots in the species color
  [
    [-3, -4],
    [2, -1],
    [-2, 3],
    [3, 4],
  ].forEach(([dx, dy]) => {
    set(g, cx + dx, cy + dy, p.body);
    set(g, cx + dx + 1, cy + dy, p.body);
    set(g, cx + dx, cy + dy + 1, p.shade);
  });
  // Cracks when it's about to hatch
  if (progress > 0.6) {
    const crack = [
      [-5, -1],
      [-4, -2],
      [-3, -1],
      [-2, -2],
      [-1, -1],
      [0, -2],
      [1, -1],
      [2, -2],
    ];
    crack.forEach(([dx, dy]) => set(g, cx + dx, cy + dy, OUTLINE));
  }
}

function drawCreature(g, { species, stageIndex, mood, frame, blink }) {
  const p = species.palette;
  const r = [0, 6, 8, 9, 11][stageIndex];
  const ry = Math.round(r * 0.9);
  const bounce = mood === 'sleeping' || mood === 'sad' ? 0 : mood === 'happy' ? (frame % 2 ? 2 : 0) : frame % 2;
  const cx = 16;
  const cy = 29 - ry - 1 - bounce;
  const shade = (x, y) => (y > cy + ry * 0.35 ? p.shade : p.body);

  // --- Silhouette ---
  if (species.id === 'cat' || species.id === 'dragon') {
    // tail
    const side = species.id === 'cat' ? 1 : -1;
    for (let i = 0; i < Math.max(3, r - 2); i++) {
      const tx = cx + side * (r + i - 1);
      const ty = cy + ry - 2 - Math.round(i * (species.id === 'cat' ? 0.9 : 0.4));
      set(g, tx, ty, p.shade);
      set(g, tx, ty + 1, p.shade);
    }
  }
  if (species.id === 'dragon' && stageIndex >= 3) {
    // wings
    for (const s of [-1, 1])
      for (let k = 0; k < 5; k++) for (let j = 0; j <= k; j++) set(g, cx + s * (r - 1 + j), cy - 4 + k, p.shade);
  }

  if (species.id === 'bot') {
    rect(g, cx - r, cy - ry, r * 2, ry * 2, shade);
    // antenna
    for (let k = 1; k <= 3; k++) set(g, cx, cy - ry - k, p.shade);
    if (stageIndex >= 4) for (const s of [-1, 1]) rect(g, s > 0 ? cx + r : cx - r - 2, cy, 2, 3, () => p.shade);
  } else {
    ellipse(g, cx, cy, r, ry, shade);
  }

  if (species.id === 'cat') {
    const h = Math.max(3, Math.round(r / 2.5));
    spike(g, cx - Math.round(r * 0.55), cy - ry - h + 2, h, p.body);
    spike(g, cx + Math.round(r * 0.55), cy - ry - h + 2, h, p.body);
  }
  if (species.id === 'dragon' && stageIndex >= 2) {
    spike(g, cx - Math.round(r * 0.45), cy - ry - 1, 2, p.accent);
    spike(g, cx + Math.round(r * 0.45), cy - ry - 1, 2, p.accent);
  }
  // feet
  const footY = cy + ry;
  for (const s of [-1, 1]) {
    const fx = cx + s * Math.max(2, Math.round(r * 0.5));
    if (footY < N) {
      set(g, fx, footY, p.shade);
      set(g, fx - s, footY, p.shade);
    }
  }

  outline(g);

  // --- Details (no outline) ---
  if (species.id === 'bot') set(g, cx, cy - ry - 4, p.accent);
  if (species.id === 'blob') {
    set(g, cx - Math.round(r * 0.5), cy - Math.round(ry * 0.55), p.accent);
    set(g, cx - Math.round(r * 0.5) + 1, cy - Math.round(ry * 0.65), p.accent);
  }
  if (species.id === 'cat') {
    // whiskers
    for (const s of [-1, 1]) {
      set(g, cx + s * (r - 1), cy + 1, OUTLINE);
      set(g, cx + s * r, cy, OUTLINE);
    }
  }

  // eyes
  const ex = Math.max(2, Math.round(r * 0.4));
  const ey = cy - Math.round(ry * 0.15);
  for (const s of [-1, 1]) {
    const x = cx + s * ex - (s < 0 ? 1 : 0);
    if (mood === 'sleeping' || blink) {
      set(g, x, ey + 1, EYE);
      set(g, x + 1, ey + 1, EYE);
    } else if (mood === 'happy') {
      set(g, x, ey + 1, EYE);
      set(g, x + 1, ey, EYE);
      set(g, x + 2, ey + 1, EYE);
    } else {
      const big = stageIndex >= 2;
      set(g, x, ey, EYE);
      set(g, x, ey + 1, EYE);
      if (big) {
        set(g, x + 1, ey, '#ffffff');
        set(g, x + 1, ey + 1, EYE);
      }
      if (mood === 'sad' && s > 0) set(g, x + 1, ey + 3, '#60a5fa'); // tear
    }
  }

  // mouth
  const my = ey + 3;
  if (mood === 'happy') {
    set(g, cx - 1, my, EYE);
    set(g, cx, my + 1, EYE);
    set(g, cx + 1, my, EYE);
  } else if (mood === 'sad') {
    set(g, cx - 1, my + 1, EYE);
    set(g, cx, my, EYE);
    set(g, cx + 1, my + 1, EYE);
  } else if (mood !== 'sleeping') {
    set(g, cx, my, EYE);
  }

  // cheeks
  if (mood === 'happy' && r >= 8) for (const s of [-1, 1]) set(g, cx + s * (ex + 2), my - 1, '#f9a8d4');

  // crown for the adult stage
  if (stageIndex >= 4) {
    const top = cy - ry - (species.id === 'cat' ? 4 : species.id === 'bot' ? 6 : 2);
    rect(g, cx - 3, top, 7, 2, () => GOLD);
    [-3, 0, 3].forEach((d) => set(g, cx + d, top - 1, GOLD));
  }
}

/**
 * Draws one pet frame on a canvas (CSS sets the visible size).
 * @param {HTMLCanvasElement} canvas
 * @param {{ species, stageIndex, mood, frame, blink, progress }} opts
 */
export function drawPet(canvas, opts) {
  // Drawn at native resolution (32x32); CSS scales it with `image-rendering: pixelated`.
  if (canvas.width !== N) canvas.width = canvas.height = N;
  const ctx = canvas.getContext('2d');
  const g = grid();
  if (opts.stageIndex === 0) drawEgg(g, opts);
  else drawCreature(g, opts);
  ctx.clearRect(0, 0, N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (g[y][x]) {
        ctx.fillStyle = g[y][x];
        ctx.fillRect(x, y, 1, 1);
      }
}

/**
 * Animates a canvas: advances frames, blinks at random and redraws.
 * `getOptions()` is read on every frame, so state can change live.
 * @returns {() => void} stops the animation
 */
export function animatePet(canvas, getOptions) {
  let frame = 0;
  let blinkUntil = 0;
  let timer = null;
  const tick = () => {
    const opts = getOptions();
    if (opts) {
      if (Math.random() < 0.08) blinkUntil = Date.now() + 180;
      drawPet(canvas, { ...opts, frame: frame++, blink: Date.now() < blinkUntil });
    }
    timer = setTimeout(tick, FRAME_MS[opts?.mood] ?? FRAME_MS.idle);
  };
  tick();
  return () => clearTimeout(timer);
}
