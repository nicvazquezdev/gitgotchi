// Pure level curve: cumulative XP per level, scaled to the person's baseline.
const { LEVELS, STAGES } = require('./catalog');

/** Typical weeks of XP needed to reach `level` (piecewise linear between the anchors, steady after the last). */
function weeksFor(level) {
  const { anchors, weeksPerLevelAfter } = LEVELS;
  const last = anchors[anchors.length - 1];
  if (level >= last[0]) return last[1] + (level - last[0]) * weeksPerLevelAfter;
  const i = anchors.findLastIndex(([l]) => l <= level);
  const [l0, w0] = anchors[i];
  const [l1, w1] = anchors[i + 1];
  return w0 + ((level - l0) / (l1 - l0)) * (w1 - w0);
}

/**
 * Total XP at which `level` starts. Level 1 starts at 0; every level needs at least 1 XP more than the one before.
 * Strictly increasing, so a level is always reachable and `levelAt` is its exact inverse.
 */
function xpForLevel(level, baseline) {
  let xp = 0;
  for (let l = 2; l <= level; l++) xp = Math.max(xp + 1, Math.round(weeksFor(l) * baseline));
  return xp;
}

/** Level (1+) reached with `xp` total. */
function levelAt(xp, baseline) {
  let level = 1;
  while (xpForLevel(level + 1, baseline) <= xp) level++;
  return level;
}

/** Index in STAGES of the stage a level unlocks. */
const stageIndexFor = (level) => STAGES.findLastIndex((s) => level >= s.level);

module.exports = { xpForLevel, levelAt, stageIndexFor };
