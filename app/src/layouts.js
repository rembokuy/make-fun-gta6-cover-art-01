// Layouts: how the cover splits its photo area into panels.
//
// A layout is { id, name, slots } plus a panelRects function that turns a
// layout id and a canvas size into the rectangles each slot occupies.
// A panel is { x, y, w, h } and may also carry rot (degrees, for tilted
// polaroids), frame (a white polaroid border) or backdrop (a full-bleed
// photo behind the others).

export const LAYOUTS = [
  { id: 'four', name: 'Four-Panel Grid', slots: 4 },
  { id: 'hero-three', name: 'Hero + Three', slots: 4 },
  { id: 'full', name: 'Full Bleed', slots: 1 },
  { id: 'nine', name: 'Nine-Panel Grid', slots: 9 },
  { id: 'tilted', name: 'Tilted Snapshots', slots: 4 },
];

/** Find a layout by id; an unknown id falls back to the first layout. */
export function findLayout(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** How many photo slots a layout has. */
export function slotCount(layoutId) {
  return findLayout(layoutId).slots;
}

function gridRects(cols, rows, W, top, gap) {
  const cellW = (W - gap * (cols + 1)) / cols;
  const cellH = (top - gap * (rows + 1)) / rows;
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        x: gap + c * (cellW + gap),
        y: gap + r * (cellH + gap),
        w: cellW,
        h: cellH,
      });
    }
  }
  return rects;
}

/**
 * Panel rectangles for a layout on a W x H canvas whose lettering band
 * takes titleH pixels at the bottom. The photo area is everything above
 * the band (except a full-bleed layout, which covers the whole canvas).
 */
export function panelRects(layoutId, W, H, titleH) {
  const gap = Math.max(6, Math.round(Math.min(W, H) * 0.012));
  const top = H - titleH;
  switch (layoutId) {
    case 'four':
      return gridRects(2, 2, W, top, gap);
    case 'nine':
      return gridRects(3, 3, W, top, gap);
    case 'hero-three': {
      const heroW = W * 0.6;
      const sideW = W - heroW - 2 * gap;
      const sideH = (top - 4 * gap) / 3;
      const rects = [{ x: gap, y: gap, w: heroW - gap, h: top - 2 * gap }];
      for (let i = 0; i < 3; i++) {
        rects.push({
          x: heroW + gap,
          y: gap + i * (sideH + gap),
          w: sideW,
          h: sideH,
        });
      }
      return rects;
    }
    case 'full':
      return [{ x: 0, y: 0, w: W, h: H, backdrop: true }];
    case 'tilted':
      return [
        { x: 0, y: 0, w: W, h: H, backdrop: true },
        { x: W * 0.05, y: H * 0.05, w: W * 0.44, h: H * 0.36, rot: -6, frame: true },
        { x: W * 0.51, y: H * 0.09, w: W * 0.44, h: H * 0.36, rot: 5, frame: true },
        { x: W * 0.27, y: H * 0.44, w: W * 0.46, h: H * 0.29, rot: -3, frame: true },
      ];
    default:
      return panelRects('four', W, H, titleH);
  }
}
