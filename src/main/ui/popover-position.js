// Pure helper: where the PR popover goes relative to the pet.
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * Popover bounds centered on `anchor` (the pet's rect on screen): above it, or below when there is no room,
 * clamped inside `workArea`. The height is never shortened: when it fits neither above nor below it goes on the side
 * with more space and covers the pet as little as it can.
 * `aim` is where the notch of the shell points, from the popover's left edge: at the pet's center, however far the
 * popover had to move to fit on screen (but never past `aimInset`: the notch stays on the flat of the body).
 * @param {{anchor: {x:number,y:number,width:number,height:number}, size: {width:number,height:number},
 *          workArea: {x:number,y:number,width:number,height:number}, gap?: number, margin?: number,
 *          aimInset?: number}} args
 * @returns {{x:number,y:number,width:number,height:number,placement:'above'|'below',aim:number}}
 */
function popoverBounds({ anchor, size, workArea, gap = 10, margin = 8, aimInset = 64 }) {
  const { width, height } = size;
  const above = anchor.y - gap - height;
  const spaceAbove = anchor.y - gap - (workArea.y + margin);
  const spaceBelow = workArea.y + workArea.height - margin - (anchor.y + anchor.height + gap);
  const fitsAbove = spaceAbove >= height;
  const fitsBelow = spaceBelow >= height;
  const placement = fitsAbove || (!fitsBelow && spaceAbove >= spaceBelow) ? 'above' : 'below';
  const y = placement === 'above' ? above : anchor.y + anchor.height + gap;
  const centerX = anchor.x + anchor.width / 2;
  const minX = workArea.x + margin;
  const x = clamp(centerX - width / 2, minX, Math.max(minX, workArea.x + workArea.width - width - margin));
  return {
    x: Math.round(x),
    y: Math.round(clamp(y, workArea.y, Math.max(workArea.y, workArea.y + workArea.height - height))),
    width,
    height,
    placement,
    aim: Math.round(clamp(centerX - x, aimInset, width - aimInset)),
  };
}

/** Screen rect of a rect given in a window's own coordinates (what the pet window reports). */
function toScreenRect(windowBounds, rect) {
  return { x: windowBounds.x + rect.x, y: windowBounds.y + rect.y, width: rect.width, height: rect.height };
}

module.exports = { popoverBounds, toScreenRect };
