// Neon Coast design state: the serialisable part of a cover (everything except
// the loaded image pixels) plus undo/redo over it. Photos live outside the
// state — the panels only store an index into the photo list — so a snapshot
// stays small and an undo never has to re-decode an image.

import { slotCount } from './layouts.js';

/** A fresh design: four-panel grid, Vice Sunset grade, sample photos in. */
export function freshDesign(photoCount) {
  return {
    layout: 'four',
    grade: 'vice',
    title: 'SUNSET HEIST',
    subtitle: 'a neon coast story',
    badge: 'NEON COAST',
    grain: true,
    vignette: true,
    halftone: true,
    panels: Array.from({ length: 9 }, (_, i) => ({
      // Photos cycle across the slots so every layout starts full; a slot can
      // still be cleared back to empty from the editor.
      photo: photoCount > 0 ? i % photoCount : -1,
      zoom: 1,
      ox: 0,
      oy: 0,
    })),
  };
}

/** A plain deep copy of a design, safe to store on the undo stack. */
export function snapshot(design) {
  return JSON.parse(JSON.stringify(design));
}

/** Makes sure every layout slot has a panel entry after a layout change. */
export function normalisePanels(design) {
  const slots = slotCount(design.layout);
  while (design.panels.length < slots) {
    design.panels.push({ photo: -1, zoom: 1, ox: 0, oy: 0 });
  }
  return design;
}

/**
 * Undo/redo history over designs. `push` records the design before a change;
 * `undo`/`redo` return the design to restore, or null when there is nothing
 * to step to. The stack is capped so a long session stays light.
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
