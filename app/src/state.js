// The cover design: a plain serialisable object plus an undo history.
// A panel points at a photo by index (-1 = empty) and stores its own zoom
// and pan offsets, so every panel can be framed independently.

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
    layout: "four",
    grade: "vice",
    title: "SUNSET HEIST",
    subtitle: "a neon coast story",
    badge: "NEON COAST",
    grain: true,
    vignette: true,
    halftone: true,
    panels,
  };
}

export function snapshot(design) {
  return JSON.parse(JSON.stringify(design));
}

// Grow the panels array with empty panels until it matches the slot count
// of the design's active layout.
export function normalisePanels(design) {
  const need = slotCount(design.layout);
  while (design.panels.length < need) design.panels.push(emptyPanel());
  return design;
}

export function createHistory(limit = 60) {
  let past = [];
  let future = [];
  return {
    push(design) {
      past.push(snapshot(design));
      if (past.length > limit) past = past.slice(past.length - limit);
      future = [];
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
