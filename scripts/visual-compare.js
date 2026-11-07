// Compares two screenshots (raw 4-byte pixels, as nativeImage.toBitmap gives them). Pure: no Electron, so it has tests.

/** A channel may differ by this much without the pixel counting as different (anti-aliasing noise). */
const CHANNEL_TOLERANCE = 8;
/** Share of pixels that may differ before the screenshot counts as different (0.05%: a few glyph edges). */
const MAX_DIFFERENT_RATIO = 0.0005;

/**
 * @param {{ width: number, height: number, data: Buffer }} baseline
 * @param {{ width: number, height: number, data: Buffer }} actual
 * @returns {{ same: boolean, sizeMismatch: boolean, differing: number, total: number, ratio: number, diff: Buffer | null }}
 *   `diff`: a bitmap of the same size, the actual screenshot dimmed with the pixels that differ in red (null when the
 *   sizes do not match, because pixels cannot be paired).
 */
function compareBitmaps(
  baseline,
  actual,
  { channelTolerance = CHANNEL_TOLERANCE, maxRatio = MAX_DIFFERENT_RATIO } = {},
) {
  if (baseline.width !== actual.width || baseline.height !== actual.height) {
    return { same: false, sizeMismatch: true, differing: 0, total: 0, ratio: 1, diff: null };
  }
  const total = actual.width * actual.height;
  const diff = Buffer.alloc(total * 4);
  let differing = 0;
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    let changed = false;
    for (let c = 0; c < 3; c++)
      if (Math.abs(baseline.data[i + c] - actual.data[i + c]) > channelTolerance) changed = true;
    if (changed) {
      differing++;
      diff[i + 2] = 255; // red, in the BGRA order of the bitmaps
    } else {
      for (let c = 0; c < 3; c++) diff[i + c] = Math.round(actual.data[i + c] * 0.35);
    }
    diff[i + 3] = 255;
  }
  const ratio = total === 0 ? 0 : differing / total;
  return { same: ratio <= maxRatio, sizeMismatch: false, differing, total, ratio, diff };
}

module.exports = { compareBitmaps, CHANNEL_TOLERANCE, MAX_DIFFERENT_RATIO };
