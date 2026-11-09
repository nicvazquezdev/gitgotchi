// Pure helper: where the PR popover goes relative to the pet, and where its tail points.
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

/**
 * Popover bounds centered on `anchor` (the pet's rect on screen): above it, or below when there is no room,
 * clamped inside `workArea`. `height` includes the tail, and it is never shortened: when it fits neither above nor
 * below it goes on the side with more space and covers the pet as little as it can.
 * `tailX` is where the tail points, from the popover's left edge.
 * @param {{anchor: {x:number,y:number,width:number,height:number}, size: {width:number,height:number},
 *          workArea: {x:number,y:number,width:number,height:number}, gap?: number, margin?: number, tailInset?: number}} args
 * @returns {{x:number,y:number,width:number,height:number,placement:'above'|'below',tailX:number}}
 */
function popoverBounds({ anchor, size, workArea, gap = 2, margin = 8, tailInset = 28 }) {
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
    tailX: Math.round(clamp(centerX - x, tailInset, width - tailInset)),
  };
}

/** Screen rect of a rect given in a window's own coordinates (what the pet window reports). */
function toScreenRect(windowBounds, rect) {
  return { x: windowBounds.x + rect.x, y: windowBounds.y + rect.y, width: rect.width, height: rect.height };
}

module.exports = { popoverBounds, toScreenRect };
