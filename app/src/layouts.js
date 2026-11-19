// Neon Coast layouts: where the photo panels sit on the cover.
//
// Every layout is computed from the cover size, so one arrangement works at
// 1080 x 1080, 1080 x 1350 and 1920 x 1080 alike. A panel is
// {x, y, w, h} in cover pixels, with two optional extras: `rot` (degrees, for
// the tilted polaroids) and `frame` (draw a white polaroid border), plus
// `backdrop` for a slot that is the full-bleed background under the others.
// `titleH` is the height of the lettering band along the foot; grid layouts
// keep their panels above it, while full-bleed runs underneath and the title
// is scrimmed over the top.

export const LAYOUTS = [
  { id: 'four', name: 'Four-Panel Grid', slots: 4 },
  { id: 'hero-three', name: 'Hero + Three', slots: 4 },
  { id: 'full', name: 'Full Bleed', slots: 1 },
  { id: 'nine', name: 'Nine-Panel Grid', slots: 9 },
  { id: 'tilted', name: 'Tilted Snapshots', slots: 4 },
];

/** Finds a layout by id; unknown ids fall back to the first layout. */
export function layoutById(id) {
  for (const layout of LAYOUTS) {
    if (layout.id === id) return layout;
  }
  return LAYOUTS[0];
}

/** How many photo slots a layout has. */
export function slotCount(layoutId) {
  return layoutById(layoutId).slots;
}

/** A cols x rows grid of equal rects inside the photo area. */
function gridRects(cols, rows, W, top, gap) {
  const w = (W - gap * (cols + 1)) / cols;
  const h = (top - gap * (rows + 1)) / rows;
  const rects = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      rects.push({
        x: gap + col * (w + gap),
        y: gap + row * (h + gap),
        w,
        h,
      });
    }
  }
  return rects;
}

/**
 * The panel rects for a layout at cover size W x H, with a lettering band of
 * `titleH` along the foot. Rects come back in fill order: slot 0 first.
 */
export function panelRects(layoutId, W, H, titleH) {
  const gap = Math.max(6, Math.round(Math.min(W, H) * 0.012));
  const top = H - titleH;

  if (layoutId === 'four') return gridRects(2, 2, W, top, gap);
  if (layoutId === 'nine') return gridRects(3, 3, W, top, gap);

  if (layoutId === 'hero-three') {
    const heroW = Math.round(W * 0.6);
    const sideX = heroW + gap;
    const sideW = W - heroW - gap * 2;
    const cellH = (top - gap * 4) / 3;
    return [
      { x: gap, y: gap, w: heroW - gap, h: top - gap * 2 },
      { x: sideX, y: gap, w: sideW, h: cellH },
      { x: sideX, y: gap + cellH + gap, w: sideW, h: cellH },
      { x: sideX, y: gap + (cellH + gap) * 2, w: sideW, h: cellH },
    ];
  }

  if (layoutId === 'full') {
    return [{ x: 0, y: 0, w: W, h: H }];
  }

  // Tilted Snapshots: slot 0 is the full-bleed backdrop; slots 1..3 are
  // overlapping polaroids, each rotated a few degrees.
  return [
    { x: 0, y: 0, w: W, h: H, backdrop: true },
    { x: W * 0.05, y: H * 0.05, w: W * 0.44, h: H * 0.36, rot: -6, frame: true },
    { x: W * 0.51, y: H * 0.09, w: W * 0.44, h: H * 0.36, rot: 5, frame: true },
    { x: W * 0.27, y: H * 0.44, w: W * 0.46, h: H * 0.29, rot: -3, frame: true },
  ];
}
