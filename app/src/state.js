// Studio state for Neon Coast Cover Studio.
// One plain object holds everything the cover needs, and a small
// history stack makes every change undoable.

export const DEFAULT_TITLE = 'NEON COAST';
export const DEFAULT_TAGLINE = 'A VICE CITY STORY';

export function freshState() {
  return {
    photo: 0,
    layout: 'sunset-stack',
    palette: 'coral-dusk',
    title: DEFAULT_TITLE,
    tagline: DEFAULT_TAGLINE,
  };
}

export function snapshot(state) {
  return JSON.parse(JSON.stringify(state));
}

export function createHistory(limit) {
  const stack = [];
  const max = typeof limit === 'number' && limit > 0 ? limit : 40;
  return {
    push(state) {
      stack.push(snapshot(state));
      while (stack.length > max) stack.shift();
    },
    canUndo() {
      return stack.length > 0;
    },
    undo(current) {
      if (stack.length === 0) return current;
      return stack.pop();
    },
    depth() {
      return stack.length;
    },
  };
}
