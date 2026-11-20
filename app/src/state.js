import { slotCount } from "./layouts.js";

export const MAX_PANELS = 9;

export function emptyPanel() {
  return { photo: -1, zoom: 1, ox: 0, oy: 0 };
}

export function freshDesign(photoCount) {
  const panels = [];
  for (let i = 0; i < MAX_PANELS; i++) {
    const panel = emptyPanel();
    if (photoCount > 0) panel.photo = i % photoCount;
    panels.push(panel);
  }
  return {
    panels,
    layout: "four",
    grade: "vice",
    title: "SUNSET HEIST",
    subtitle: "a neon coast story",
    badge: "NEON COAST",
    grain: true,
    vignette: true,
    halftone: true,
  };
}

export function snapshot(design) {
  return JSON.parse(JSON.stringify(design));
}

export function normalisePanels(design) {
  const want = slotCount(design.layout);
  while (design.panels.length < want) design.panels.push(emptyPanel());
  if (design.panels.length > want) design.panels.length = want;
  return design;
}

export function createHistory(limit = 60) {
  const past = [];
  const future = [];
  return {
    push(design) {
      past.push(snapshot(design));
      if (past.length > limit) past.shift();
      future.length = 0;
    },
    undo(current) {
      if (past.length === 0) return null;
      future.push(snapshot(current));
      return past.pop();
    },
    redo(current) {
      if (future.length === 0) return null;
      past.push(snapshot(current));
      return future.pop();
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}
