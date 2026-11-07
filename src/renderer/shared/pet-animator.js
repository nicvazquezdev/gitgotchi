// PetAnimator, copied verbatim from player.html of the sprite pack ("PR Pet", the reference implementation) so the
// app animates exactly like the player: idle, blinks, walk, cheer, mood effects and the shadow.
// Do NOT edit it by hand or reformat it (the file is in .prettierignore): update it from a newer pack instead.
// How the app uses it (assets, policy, rendering) lives in pet-sprites.js and pet/pet-view.js.
/* ==========================================================================================================
 * PetAnimator: the reference implementation of PR Pet animation (port THIS class to Swift).
 *
 * Pure state machine + renderer for ONE pet (one line, one stage). No DOM, no timers of its own:
 *   - the host calls update(dtMs) every frame, then draw(ctx, scale, originX, originY);
 *   - all time is a virtual clock (this.t, ms), so it is deterministic given the rng;
 *   - all positions are INTEGER native pixels; drawing multiplies by an integer `scale`, no smoothing.
 *
 * Coordinates. "Native" = sprite pixels. A stage's canvas box is N x N (N = padded size). The pet's box top-left is
 * (this.x, 0) in "world" native coordinates; the host maps world (0,0) to device pixels (originX, originY).
 * Anchors in animations.json are already in padded box coordinates. When the sprite is mirrored, a point anchor
 * x becomes N-1-x and a box anchor (sweat, top-left of a w-wide box) becomes N-x-w.
 * FX particles (hearts, sparkles, ambient, puffs) live in world coordinates after they spawn (they do not follow the
 * pet when it walks away); the sweat drop is attached to the head and follows the pet (lift, shiver, walking).
 *
 * Sprite sheet: N*14 wide, N*3 tall. Row = mood (neutral, happy, anxious), column = index in `frames`.
 * Whole-sprite lift (px, negative = up) comes from stage.lift: idle[idleFrame], move[moveFrame], cheer[cheerFrame].
 * The shadow never moves vertically; it shrinks and fades with |lift| (see _drawShadow).
 * ========================================================================================================= */
export class PetAnimator {
  /**
   * @param {object} o
   *   stage    stage entry of animations.json (size, lift, motion, facing, anchors, shadowEllipse, stage)
   *   timing   TIMING from animations.json
   *   frames   FRAMES order of the sheet columns;   moods: mood order of the sheet rows
   *   sheet    sprite sheet image;  shadow: shadow image (N x N)
   *   fx       { name: {img, w, h, anchor:[x,y], frames:n} }  (heart, heartL, sparkle, sweat, sweatL, puff, ...)
   *   ambient  { fx: name, img }  the line's ambient particle sheet (may be the tinted mote sheet)
   *   rng      () => [0,1)  (inject a seeded one for tests)
   */
  constructor(o) {
    Object.assign(this, { stage: o.stage, T: o.timing, frames: o.frames, moodList: o.moods, sheet: o.sheet, shadowImg: o.shadow, fx: o.fx, amb: o.ambient });
    this.rng = o.rng || Math.random;
    this.big = this.stage.stage === 'young' || this.stage.stage === 'adult';   // large heart / sweat variants
    this.mood = 'neutral'; this.walking = false;
    this.t = 0;                                   // virtual clock, ms
    this.idleT = 0;                               // position inside the idle loop
    this.moveT = 0; this.moveFrame = 0; this.lastMove = -1;
    this.x = 0; this.dir = 1; this.flip = false;  // world x of the box (integer), walk direction, mirrored?
    this.minX = -1e9; this.maxX = 1e9;
    this.cheerT = -1; this.landed = false;        // cheerT < 0: not cheering
    this.blinkSeq = null; this.blinkT = 0; this.nextBlink = this._range(this.T.blink.every);
    this.parts = []; this.heartI = 0;
    this.nextHeart = Infinity; this.nextSparkle = Infinity; this.nextAmbient = this._range(this.T.ambient.every);
    this.sweat = null; this.nextShiver = Infinity; this.shiver = null;
    this.setMood('neutral');
  }

  // ---- public control -------------------------------------------------------------------------------------
  setMood(m) {
    this.mood = m; const T = this.T;
    this.nextHeart = m === 'happy' ? this.t + 200 : Infinity;
    this.nextSparkle = m === 'happy' ? this.t + 450 : Infinity;
    this.sweat = m === 'anxious' ? { phase: 'bead', t: 0, pause: 0 } : null;
    this.nextShiver = m === 'anxious' ? this.t + this._range(T.shiver.every) : Infinity;
    this.shiver = null;
  }
  setWalking(b) { this.walking = b; if (b) { this.moveT = 0; this.lastMove = -1; } }
  /** x range (world native px) allowed for the box's left edge: the floor edges. */
  setFloor(minX, maxX) { this.minX = minX; this.maxX = Math.max(minX, maxX); this.x = Math.min(this.maxX, Math.max(this.minX, Math.round(this.x))); }
  cheer() {
    if (this.cheerT >= 0) return;
    this.cheerT = 0; this.landed = false; this.blinkSeq = null;
    for (let i = 0; i < 3; i++) this._spawnHeart(this.t + i * 110);          // burst of 3 hearts
  }
  blink() { if (this.cheerT < 0 && !this.walking && !this.blinkSeq) this._startBlink(); }

  // ---- derived state ----------------------------------------------------------------------------------------
  get motion() { return this.stage.motion; }
  _cheerPhase() {                                  // {frame, landing} while cheering, else null
    if (this.cheerT < 0) return null;
    const C = this.T.cheer, cyc = C.ms.reduce((a, b) => a + b, 0), total = cyc * C.repeat;
    if (this.cheerT >= total) return { landing: true, frame: 0 };
    return { landing: false, frame: this._at(C.ms, this.cheerT % cyc) };
  }
  /** name of the sheet column currently shown */
  get frameName() {
    const c = this._cheerPhase();
    if (c) return c.landing ? 'idle0' : 'cheer' + c.frame;
    if (this.walking) return 'move' + this.moveFrame;
    if (this.blinkSeq) return this._blinkAt().name;
    return 'idle' + this._idleFrame();
  }
  /** whole-sprite lift in native px (negative = up) */
  get lift() {
    const L = this.stage.lift, c = this._cheerPhase();
    if (c) return c.landing ? L.idle[0] : L.cheer[c.frame];
    if (this.walking) return L.move[this.moveFrame];
    return L.idle[this._idleFrame()];
  }
  get state() { const c = this._cheerPhase(); return c ? (c.landing ? 'landing' : 'cheer') : this.walking ? 'walk' : this.blinkSeq ? 'blink' : 'idle'; }
  /** native row just below the feet (where the host puts the floor line) */
  get groundY() { const e = this.stage.shadowEllipse; return Math.ceil(e.cy + e.ry); }
  _idleFrame() { return this._at(this.mood === 'anxious' ? this.T.idleAnxious : this.T.idle, this.idleT); }

  // ---- update ------------------------------------------------------------------------------------------------
  update(dt) {
    const T = this.T, t0 = this.t; this.t += dt;
    // idle loop (keeps running under blinks and cheers; only the displayed frame is overridden)
    const idle = this.mood === 'anxious' ? T.idleAnxious : T.idle;
    this.idleT = (this.idleT + dt) % idle.reduce((a, b) => a + b, 0);

    // cheer: cheer0-3 x repeat, then idle0 for `landing` ms (dust puffs at touchdown), then back to normal
    if (this.cheerT >= 0) {
      this.cheerT += dt;
      const C = T.cheer, total = C.ms.reduce((a, b) => a + b, 0) * C.repeat;
      if (this.cheerT >= total && !this.landed) {
        this.landed = true;
        if (this.motion !== 'float') this._spawnPuffs(this.t - (this.cheerT - total));
      }
      if (this.cheerT >= total + C.landing) { this.cheerT = -1; this.nextBlink = Math.max(this.nextBlink, this.t); }
    }
    const cheering = this.cheerT >= 0;

    // walk: loop move0-3, step on every frame change
    if (this.walking && !cheering) {
      this.moveT += dt;
      const f = this._at(T.move, this.moveT % T.move.reduce((a, b) => a + b, 0));
      if (f !== this.lastMove) { this.moveFrame = f; this.lastMove = f; this._step(); }
    } else if (!this.walking) { this.moveFrame = 0; this.lastMove = -1; }
    // while cheering the walk pauses; moveFrame is unused then.

    // blinks: never during move/cheer
    if (this.blinkSeq) { this.blinkT += dt; if (this.blinkT >= this._blinkTotal()) this.blinkSeq = null; }
    if (!this.blinkSeq && !cheering && !this.walking && this.t >= this.nextBlink) this._startBlink();

    // happy: hearts (alternating anchors) and sparkles
    if (this.mood === 'happy') {
      while (this.t >= this.nextHeart) { this._spawnHeart(this.nextHeart); this.nextHeart += T.heart.every; }
      while (this.t >= this.nextSparkle) { this._spawnSparkle(this.nextSparkle); this.nextSparkle += T.sparkle.every; }
    }
    // anxious: sweat cycle + shiver
    if (this.sweat) this._updateSweat(dt);
    if (this.mood === 'anxious') {
      if (this.shiver) { this.shiver.t += dt; if (this.shiver.t >= T.shiver.ms * T.shiver.times) this.shiver = null; }
      if (!this.shiver && this.t >= this.nextShiver) { this.shiver = { t: 0, sign: this.rng() < .5 ? -1 : 1 }; this.nextShiver = this.t + this._range(T.shiver.every); }
    }
    // ambient particles (all moods)
    while (this.t >= this.nextAmbient) { this._spawnAmbient(this.nextAmbient); this.nextAmbient += this._range(T.ambient.every); }

    this.parts = this.parts.filter(p => this.t - p.born <= p.life);
  }

  // walk step: hop only travels on airborne frames (lift < 0); the sprite turns around at the floor edges
  _step() {
    const M = this.stage.lift, speed = M.speed || 1;
    if (this.motion === 'hop' && M.move[this.moveFrame] >= 0) return;
    let nx = this.x + this.dir * speed;
    if (nx > this.maxX) { nx = this.maxX; this.dir = -1; } else if (nx < this.minX) { nx = this.minX; this.dir = 1; }
    this.x = nx;
    const f = this.stage.facing;                 // 'front' never mirrors; side-facing mirrors when walking the other way
    this.flip = f === 'front' ? false : this.dir > 0 ? f === 'left' : f === 'right';
  }

  // ---- blink ---------------------------------------------------------------------------------------------------
  _startBlink() {
    const B = this.T.blink, once = B.frames.map((name, i) => ({ name, ms: B.ms[i] }));
    this.blinkSeq = this.rng() < B.double ? once.concat([{ name: 'idle0', ms: 70 }], once) : once;   // sometimes a double blink
    this.blinkT = 0; this.nextBlink = this.t + this._range(B.every);
    if (this.mood === 'happy') { /* sheet already has ^ ^ eyes: half/blink == idle0, nothing special to do */ }
  }
  _blinkTotal() { return this.blinkSeq.reduce((a, s) => a + s.ms, 0); }
  _blinkAt() { let t = this.blinkT; for (const s of this.blinkSeq) { if (t < s.ms) return s; t -= s.ms; } return this.blinkSeq[this.blinkSeq.length - 1]; }

  // ---- spawning -------------------------------------------------------------------------------------------------
  _anchor(a) { return [this.x + (this.flip ? this.stage.size - 1 - a[0] : a[0]), a[1] + this.lift]; }   // world point (lifted)
  _spawnHeart(born) {
    const a = this._anchor(this.stage.anchors.fx[this.heartI++ % 2]);
    this.parts.push({ kind: 'heart', fx: this.big ? 'heartL' : 'heart', x: a[0], y: a[1], born, life: this.T.heart.life, ph: this.rng() * 6.28 });
  }
  _spawnSparkle(born) {
    const a = this._anchor(this.stage.anchors.fx[Math.floor(this.rng() * 2)]), n = this.fx.sparkle.frames;
    this.parts.push({ kind: 'sparkle', fx: 'sparkle', x: a[0] + Math.round(this._range([-4, 4])), y: a[1] + Math.round(this._range([-4, 4])), born, life: n * this.T.sparkle.frame });
  }
  _spawnAmbient(born) {
    const A = this.stage.anchors.ambient, a = this._anchor(A[Math.floor(this.rng() * A.length)]), T = this.T.ambient;
    this.parts.push({ kind: 'ambient', fx: this.amb.fx, x: a[0], y: a[1], born, life: this._range(T.life), rise: this._range(T.rise), k: 1 + this.rng(), ph: this.rng() * 6.28 });
  }
  _spawnPuffs(born) {          // landing dust at the shadow's left/right edges (right one mirrored)
    const e = this.stage.shadowEllipse, N = this.stage.size, cx = this.flip ? N - e.cx : e.cx, y = Math.floor(e.cy), life = this.fx.puff.frames * this.T.puff.frame;
    this.parts.push({ kind: 'puff', fx: 'puff', x: this.x + Math.floor(cx - e.rx), y, side: -1, mirror: false, born, life });
    this.parts.push({ kind: 'puff', fx: 'puff', x: this.x + Math.floor(cx + e.rx), y, side: 1, mirror: true, born, life });
  }

  // ---- sweat -----------------------------------------------------------------------------------------------------
  _updateSweat(dt) {
    const S = this.T.sweat, w = this.sweat, dur = { bead: S.bead, slide: S.slide, stretch: S.stretch, fall: S.fall, pause: w.pause }, order = ['bead', 'slide', 'stretch', 'fall', 'pause'];
    w.t += dt;
    while (w.t >= dur[w.phase]) {
      w.t -= dur[w.phase]; w.phase = order[(order.indexOf(w.phase) + 1) % 5];
      if (w.phase === 'pause') { w.pause = this._range(S.pause); dur.pause = w.pause; }
      if (w.phase === 'bead') { /* new drop */ }
    }
  }
  /** {frame, dy, alpha} for the sweat drop, or null while pausing */
  _sweatState() {
    if (!this.sweat) return null;
    const S = this.T.sweat, w = this.sweat;
    switch (w.phase) {
      case 'bead': return { frame: 0, dy: 0, alpha: 1 };
      case 'slide': return { frame: 1, dy: Math.floor(S.slideBy * w.t / S.slide), alpha: 1 };          // 1 px steps
      case 'stretch': return { frame: 2, dy: S.slideBy, alpha: 1 };
      case 'fall': return { frame: 3, dy: S.slideBy + Math.round(S.fallBy * w.t / S.fall), alpha: 1 - w.t / S.fall };
      default: return null;
    }
  }
  _shiverX() { const s = this.shiver; return s ? (Math.floor(s.t / this.T.shiver.ms) % 2 === 0 ? s.sign : -s.sign) : 0; }

  // ---- helpers ---------------------------------------------------------------------------------------------------
  _range(r) { return r[0] + this.rng() * (r[1] - r[0]); }
  _at(arr, t) { let i = 0; for (; i < arr.length - 1; i++) { if (t < arr[i]) break; t -= arr[i]; } return i; }   // index of the segment containing t

  /** visual state of a particle at the current time: {frame, x, y, alpha} or null (not born yet) */
  _pstate(p) {
    const age = this.t - p.born; if (age < 0) return null;
    const T = this.T, n = this.fx[p.fx] ? this.fx[p.fx].frames : this.amb.frames;
    switch (p.kind) {
      case 'heart': { const H = T.heart; return { frame: Math.min(Math.floor(age / H.pop), n - 1), x: p.x + Math.round(H.sway * Math.sin(age / H.life * 9.4 + p.ph)), y: p.y - Math.round(H.rise * age / H.life), alpha: age > H.life - H.fade ? Math.max(0, (H.life - age) / H.fade) : 1 }; }
      case 'sparkle': return { frame: Math.min(n - 1, Math.floor(age / T.sparkle.frame)), x: p.x, y: p.y, alpha: 1 };
      case 'ambient': { const A = T.ambient; return { frame: Math.min(n - 1, Math.floor(age / p.life * n)), x: p.x + Math.round(A.sway * Math.sin(age / p.life * 6.28 * p.k + p.ph)), y: p.y - Math.round(p.rise * age / p.life), alpha: age > p.life - 350 ? Math.max(0, (p.life - age) / 350) : 1 }; }
      case 'puff': return { frame: Math.min(n - 1, Math.floor(age / T.puff.frame)), x: p.x + p.side * Math.round(T.puff.drift * age / p.life), y: p.y, alpha: 1 };
    }
    return null;
  }

  // ---- draw -------------------------------------------------------------------------------------------------------
  /**
   * @param ctx    2D context (imageSmoothingEnabled is forced to false)
   * @param scale  integer device pixels per native pixel
   * @param ox,oy  device position of world (0,0) = the box's top-left when x = 0
   */
  draw(ctx, scale, ox = 0, oy = 0) {
    ctx.imageSmoothingEnabled = false;
    const st = this.stage, N = st.size, lift = this.lift, X = ox + this.x * scale;
    this._drawShadow(ctx, scale, X, oy, lift);

    // sprite: one cell of the sheet, lifted, shifted by the shiver, mirrored if needed
    const col = this.frames.indexOf(this.frameName), row = this.moodList.indexOf(this.mood), dx = this._shiverX(), dy = lift;
    ctx.save();
    if (this.flip) { ctx.translate(X + (N + dx) * scale, oy + dy * scale); ctx.scale(-1, 1); } else ctx.translate(X + dx * scale, oy + dy * scale);
    ctx.drawImage(this.sheet, col * N, row * N, N, N, 0, 0, N * scale, N * scale);
    ctx.restore();

    // FX layer (above the sprite, may leave the box)
    for (const p of this.parts) {
      const s = this._pstate(p); if (!s) continue;
      const m = p.kind === 'ambient' ? this.amb : this.fx[p.fx];
      this._drawFx(ctx, m, s.frame, s.x, s.y, scale, ox, oy, s.alpha, p.mirror);
    }
    const sw = this._sweatState();
    if (sw) {                                   // attached to the head: follows lift, shiver and mirroring
      const m = this.fx[this.big ? 'sweatL' : 'sweat'], a = st.anchors.sweat, lx = this.flip ? N - a[0] - m.w : a[0];
      this._drawFx(ctx, m, sw.frame, this.x + lx + this._shiverX() + m.anchor[0], a[1] + lift + sw.dy + m.anchor[1], scale, ox, oy, sw.alpha, false);
    }
  }

  // (wx, wy) = world pixel where the FX's anchor pixel goes
  _drawFx(ctx, m, frame, wx, wy, scale, ox, oy, alpha, mirror) {
    const ax = mirror ? m.w - 1 - m.anchor[0] : m.anchor[0], px = ox + (wx - ax) * scale, py = oy + (wy - m.anchor[1]) * scale;
    ctx.save(); ctx.globalAlpha = alpha;
    if (mirror) { ctx.translate(px + m.w * scale, py); ctx.scale(-1, 1); ctx.drawImage(m.img, frame * m.w, 0, m.w, m.h, 0, 0, m.w * scale, m.h * scale); }
    else ctx.drawImage(m.img, frame * m.w, 0, m.w, m.h, px, py, m.w * scale, m.h * scale);
    ctx.restore();
  }

  /** The shadow never moves. With lift it scales by 1-0.24t and fades by 1-0.4t (t = min(1,|lift|/6)) around its centre. */
  _drawShadow(ctx, scale, X, oy, lift) {
    const N = this.stage.size, e = this.stage.shadowEllipse, t = Math.min(1, Math.abs(lift) / 6), cx = this.flip ? N - e.cx : e.cx;
    ctx.save(); ctx.globalAlpha = 1 - 0.4 * t;
    if (t === 0) {                              // rest: the exported image
      if (this.flip) { ctx.translate(X + N * scale, oy); ctx.scale(-1, 1); ctx.drawImage(this.shadowImg, 0, 0, N * scale, N * scale); }
      else ctx.drawImage(this.shadowImg, X, oy, N * scale, N * scale);
    } else {                                    // lifted: same pixel rule as the exporter, ellipse radii scaled (stays crisp)
      const k = 1 - 0.24 * t, rx = e.rx * k, ry = e.ry * k;
      for (let y = Math.floor(e.cy - ry); y <= Math.ceil(e.cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const d = ((x + .5 - cx) / rx) ** 2 + ((y + .5 - e.cy) / ry) ** 2;
        if (d <= 1) { ctx.fillStyle = `rgba(42,24,64,${(d < .4 ? .24 : .13) * e.alpha})`; ctx.fillRect(X + x * scale, oy + y * scale, scale, scale); }
      }
    }
    ctx.restore();
  }
}
