// Neon Coast design state: the serialisable part of a cover (everything but
// the loaded image pixels) plus undo/redo over it. Photos live outside the
// state — each panel only stores an index into the photo list — so a snapshot
// stays small and an undo never has to re-decode an image.

import { slotCount } from './layouts.js';

/** The blank slot every panel starts from: no photo, no zoom, no pan. */
function emptyPanel() {
  return { photo: -1, zoom: 1, ox: 0, oy: 0 };
}

/** A fresh design: four-panel grid, Vice Sunset grade, photos dealt in. */
export function freshDesign(photoCount) {
  const panels = [];
  for (let i = 0; i < 9; i += 1) {
    // Photos cycle across the slots so every layout starts full; a slot can
    // still be cleared back to empty from the editor.
    const slot = emptyPanel();
    if (photoCount > 0) slot.photo = i % photoCount;
    panels.push(slot);
  }
  return {
    layout: 'four',
    grade: 'vice',
    title: 'SUNSET HEIST',
    subtitle: 'a neon coast story',
    badge: 'NEON COAST',
    grain: true,
    vignette: true,
    halftone: true,
    panels,
  };
}

/** A plain deep copy of a design, safe to keep on the undo stack. */
export function snapshot(design) {
  return JSON.parse(JSON.stringify(design));
}

/** Grows the panel list so every slot of the current layout has an entry. */
export function normalisePanels(design) {
  const wanted = slotCount(design.layout);
  while (design.panels.length < wanted) design.panels.push(emptyPanel());
  return design;
}

/**
 * Undo/redo history over designs. `push` records the design before a change;
 * `undo`/`redo` hand back the design to restore, or null when there is
 * nothing to step to. The stack is capped so a long session stays light.
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
