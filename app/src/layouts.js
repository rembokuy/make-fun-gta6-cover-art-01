export const LAYOUTS = [
  { id: "four", name: "Four-Panel Grid", slots: 4 },
  { id: "hero-three", name: "Hero + Three", slots: 4 },
  { id: "full", name: "Full Bleed", slots: 1 },
  { id: "nine", name: "Nine-Panel Grid", slots: 9 },
  { id: "tilted", name: "Tilted Snapshots", slots: 4 },
];

export function findLayout(id) {
  return LAYOUTS.find((layout) => layout.id === id) || LAYOUTS[0];
}

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

export function panelRects(layoutId, W, H, titleH) {
  const gap = Math.max(6, Math.round(Math.min(W, H) * 0.012));
  const top = H - titleH;
  const layout = findLayout(layoutId);
  if (layout.id === "full") {
    return [{ x: 0, y: 0, w: W, h: H, backdrop: true }];
  }
  if (layout.id === "nine") {
    return gridRects(3, 3, W, top, gap);
  }
  if (layout.id === "four") {
    return gridRects(2, 2, W, top, gap);
  }
  if (layout.id === "hero-three") {
    const heroW = Math.round(W * 0.6);
    const sideW = W - heroW - 2 * gap;
    const cellH = (top - 4 * gap) / 3;
    const rects = [{ x: gap, y: gap, w: heroW - gap, h: top - 2 * gap }];
    for (let i = 0; i < 3; i++) {
      rects.push({
        x: heroW + gap,
        y: gap + i * (cellH + gap),
        w: sideW,
        h: cellH,
      });
    }
    return rects;
  }
  if (layout.id === "tilted") {
    return [
      { x: 0.05 * W, y: 0.05 * H, w: 0.44 * W, h: 0.36 * H, rot: -6, frame: true, backdrop: true },
      { x: 0.51 * W, y: 0.09 * H, w: 0.44 * W, h: 0.36 * H, rot: 5, frame: true, backdrop: true },
      { x: 0.27 * W, y: 0.44 * H, w: 0.46 * W, h: 0.29 * H, rot: -3, frame: true, backdrop: true },
    ];
  }
  return gridRects(2, 2, W, top, gap);
}
