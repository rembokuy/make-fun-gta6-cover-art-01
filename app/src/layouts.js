// Neon Coast layouts: where the photo panels sit on the cover. Every layout is
// a function of the cover size, so the same arrangement works at 1080 x 1080,
// 1080 x 1350 and 1920 x 1080. A panel rect is {x, y, w, h} in cover pixels,
// plus an optional rotation (tilted snapshots) and an optional `frame` flag for
// the white polaroid border. `titleH` is the height of the lettering band at
// the foot of the cover; grid layouts keep their panels above it, while the
// full-bleed layout runs underneath it and the title is scrimmed over the top.

export const LAYOUTS = [
  { id: 'four', name: 'Four-Panel Grid', slots: 4 },
  { id: 'hero-three', name: 'Hero + Three', slots: 4 },
  { id: 'full', name: 'Full Bleed', slots: 1 },
  { id: 'nine', name: 'Nine-Panel Grid', slots: 9 },
  { id: 'tilted', name: 'Tilted Snapshots', slots: 4 },
];

/** Looks a layout up by id, falling back to the first layout. */
export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** How many photo slots a layout has (its panels, background included). */
export function slotCount(layoutId) {
  return layoutById(layoutId).slots;
}

/**
 * Returns the panel rects for a layout at cover size W x H, with a lettering
 * band of `titleH` pixels along the foot. Rects are ordered the way the
 * editor's filmstrip fills them: slot 0 first.
 */
export function panelRects(layoutId, W, H, titleH) {
  const gap = Math.max(6, Math.round(Math.min(W, H) * 0.012));
  const top = H - titleH;
  const x0 = gap;
  const y0 = gap;

  if (layoutId === 'four') {
    const w = (W - gap * 3) / 2;
    const h = (top - gap * 3) / 2;
    return [
      { x: x0, y: y0, w, h },
      { x: x0 + w + gap, y: y0, w, h },
      { x: x0, y: y0 + h + gap, w, h },
      { x: x0 + w + gap, y: y0 + h + gap, w, h },
    ];
  }

  if (layoutId === 'hero-three') {
    const heroW = Math.round(W * 0.6);
    const sideX = heroW + gap;
    const sideW = W - heroW - gap * 2;
    const sh = (top - gap * 4) / 3;
    return [
      { x: x0, y: y0, w: heroW - gap, h: top - gap * 2 },
      { x: sideX, y: y0, w: sideW, h: sh },
      { x: sideX, y: y0 + sh + gap, w: sideW, h: sh },
      { x: sideX, y: y0 + (sh + gap) * 2, w: sideW, h: sh },
    ];
  }

  if (layoutId === 'full') {
    return [{ x: 0, y: 0, w: W, h: H }];
  }

  if (layoutId === 'nine') {
    const w = (W - gap * 4) / 3;
    const h = (top - gap * 4) / 3;
    const rects = [];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        rects.push({ x: x0 + col * (w + gap), y: y0 + row * (h + gap), w, h });
      }
    }
    return rects;
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
