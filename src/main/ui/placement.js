// Pure window placement helpers.

/** Top-left corner that centers a window of `size` in `workArea` (kept inside it if the window is bigger). */
function centeredIn(workArea, { width, height }) {
  return {
    x: Math.round(workArea.x + Math.max(0, (workArea.width - width) / 2)),
    y: Math.round(workArea.y + Math.max(0, (workArea.height - height) / 2)),
  };
}

module.exports = { centeredIn };
