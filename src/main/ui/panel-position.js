// Pure helper: where the menu-bar panel goes relative to its anchor.
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * Panel bounds centered under `anchor` (tray icon rect, or a zero-size rect at the cursor),
 * flipped above it when it doesn't fit below, then clamped inside `workArea`.
 * @param {{anchor: {x:number,y:number,width:number,height:number}, size: {width:number,height:number},
 *          workArea: {x:number,y:number,width:number,height:number}, gap?: number, margin?: number}} args
 */
function panelBounds({ anchor, size, workArea, gap = 6, margin = 8 }) {
  const { width, height } = size;
  const below = anchor.y + anchor.height + gap;
  const fitsBelow = below + height <= workArea.y + workArea.height - margin;
  const y = fitsBelow ? below : anchor.y - gap - height;
  const x = anchor.x + anchor.width / 2 - width / 2;
  return {
    x: Math.round(
      clamp(x, workArea.x + margin, Math.max(workArea.x + margin, workArea.x + workArea.width - width - margin)),
    ),
    y: Math.round(clamp(y, workArea.y, Math.max(workArea.y, workArea.y + workArea.height - height))),
    width,
    height,
  };
}

module.exports = { panelBounds };
