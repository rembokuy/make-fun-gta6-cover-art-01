// Panel layouts for Neon Coast Cover Studio.
// A panel is { x, y, w, h } in cover pixels, plus optional rot (degrees),
// frame (a white polaroid frame) and backdrop (a full-bleed background slot).

export const LAYOUTS = [
  { id: 'four', name: 'Four-Panel Grid', slots: 4 },
  { id: 'hero-three', name: 'Hero + Three', slots: 4 },
  { id: 'full', name: 'Full Bleed', slots: 1 },
  { id: 'nine', name: 'Nine-Panel Grid', slots: 9 },
  { id: 'tilted', name: 'Tilted Snapshots', slots: 4 },
];

export function findLayout(id) {
  return LAYOUTS.find((layout) => layout.id === id) ?? LAYOUTS[0];
}

export function slotCount(layoutId) {
  return findLayout(layoutId).slots;
}

// Rectangles for every slot of a layout inside a W x H cover.
// titleH is the height of the lettering band at the foot of the cover;
// the photo area is everything above it.
export function panelRects(layoutId, W, H, titleH) {
  const gap = Math.max(6, Math.round(Math.min(W, H) * 0.012));
  const top = H - titleH;
  const layout = findLayout(layoutId);

  if (layout.id === 'full') {
    return [{ x: 0, y: 0, w: W, h: H }];
  }

  if (layout.id === 'hero-three') {
    const heroW = Math.round(W * 0.6);
    const colW = W - heroW - 2 * gap;
    const cellH = Math.round((top - 4 * gap) / 3);
    const rects = [{ x: 0, y: 0, w: heroW, h: top }];
    for (let i = 0; i < 3; i++) {
      rects.push({ x: heroW + gap, y: gap + i * (cellH + gap), w: colW, h: cellH });
    }
    return rects;
  }

  if (layout.id === 'nine') {
    return gridRects(3, 3, W, top, gap);
  }

  if (layout.id === 'tilted') {
    return [
      { x: 0, y: 0, w: W, h: H, backdrop: true },
      { x: Math.round(W * 0.05), y: Math.round(H * 0.05), w: Math.round(W * 0.44), h: Math.round(H * 0.36), rot: -6, frame: true },
      { x: Math.round(W * 0.51), y: Math.round(H * 0.09), w: Math.round(W * 0.44), h: Math.round(H * 0.36), rot: 5, frame: true },
      { x: Math.round(W * 0.27), y: Math.round(H * 0.44), w: Math.round(W * 0.46), h: Math.round(H * 0.29), rot: -3, frame: true },
    ];
  }

  // four: a plain 2x2 grid.
  return gridRects(2, 2, W, top, gap);
}

function gridRects(cols, rows, W, top, gap) {
  const cellW = (W - gap * (cols + 1)) / cols;
  const cellH = (top - gap * (rows + 1)) / rows;
  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      rects.push({
        x: Math.round(gap + c * (cellW + gap)),
        y: Math.round(gap + r * (cellH + gap)),
        w: Math.round(cellW),
        h: Math.round(cellH),
      });
    }
  }
  return rects;
}
