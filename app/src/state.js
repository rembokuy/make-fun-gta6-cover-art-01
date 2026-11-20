// Design state for Neon Coast Cover Studio.
// A design is plain JSON: { layout, grade, title, subtitle, badge,
// grain, vignette, halftone, panels }, each panel { photo, zoom, ox, oy }
// where photo is a photo index or -1 for empty, zoom is a scale factor,
// and ox/oy pan the photo as a fraction of the panel size.

export function freshDesign(photoCount) {
  const panels = [];
  for (let i = 0; i < 9; i++) {
    panels.push({
      photo: photoCount > 0 ? i % photoCount : -1,
      zoom: 1,
      ox: 0,
      oy: 0,
    });
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

// A deep copy through JSON, so a snapshot never shares objects with the live design.
export function snapshot(design) {
  return JSON.parse(JSON.stringify(design));
}

// Grow the panel list with empty panels until it holds as many panels as
// the active layout needs.
export function normalisePanels(design, slotCount) {
  while (design.panels.length < slotCount) {
    design.panels.push({ photo: -1, zoom: 1, ox: 0, oy: 0 });
  }
  return design;
}

// Undo/redo history. push() stores a snapshot taken BEFORE a change and
// clears the redo stack; undo/redo hand back a design, or null at the end.
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
