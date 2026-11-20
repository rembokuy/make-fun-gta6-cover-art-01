// The design state: everything a cover is, as plain JSON-friendly data.
//
// A design is { layout, grade, title, subtitle, badge, grain, vignette,
// halftone, panels } where panels is a list of { photo, zoom, ox, oy }:
// photo is the index into the photo list (-1 for an empty panel), zoom
// the photo's scale, and ox/oy its pan as a fraction of the panel size.

export const DEFAULTS = {
  layout: 'four',
  grade: 'vice',
  title: 'SUNSET HEIST',
  subtitle: 'a neon coast story',
  badge: 'NEON COAST',
  grain: true,
  vignette: true,
  halftone: true,
};

const MAX_PANELS = 9;

/** An empty panel: no photo, natural zoom, centred. */
export function emptyPanel() {
  return { photo: -1, zoom: 1, ox: 0, oy: 0 };
}

/**
 * A fresh design for a photo list of photoCount photos: nine empty panels
 * with the photos dealt across them in turn, so every sample photo shows
 * up somewhere on the first cover.
 */
export function freshDesign(photoCount) {
  const design = { ...DEFAULTS, panels: [] };
  for (let i = 0; i < MAX_PANELS; i++) {
    const panel = emptyPanel();
    if (photoCount > 0) panel.photo = i % photoCount;
    design.panels.push(panel);
  }
  return design;
}

/** A deep copy of a design, safe to store in history. */
export function snapshot(design) {
  return JSON.parse(JSON.stringify(design));
}

/**
 * Grow a design's panel list with empty panels until it matches the slot
 * count of its active layout (never shrink: a layout switch keeps the
 * photos a panel already holds, so switching back restores them).
 */
export function normalisePanels(design, slots) {
  while (design.panels.length < slots) design.panels.push(emptyPanel());
  return design;
}

/**
 * Undo/redo history. push() stores the design as it was before a change
 * and clears the redo stack; undo() and redo() return the design to show,
 * or null when there is nothing to step to. The past is trimmed to the
 * limit so a long session cannot grow the history without bound.
 */
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
