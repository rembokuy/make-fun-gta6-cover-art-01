// Fixed scenes for screenshots: ?shot=editor shows the studio with sample
// photos loaded; ?shot=cover shows the cover alone, filling the viewport.
// The query picks the scene: `photos` is a comma list of sample names,
// `layout` and `grade` pick the look, `title`/`subtitle`/`badge` the words,
// `aspect` the preview shape, and `autoexport=1080x1080` makes the app save
// the exported PNG straight away so a screenshot can be the file the app
// wrote. window.__shotReady is set once the scene has painted.

/** Reads a shot scene out of the page's query string. */
export function sceneFromQuery(query) {
  const names = (query.get('photos') ?? query.get('photo') ?? 'pier')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  return {
    shot: query.get('shot') ?? 'editor',
    photos: names,
    layout: query.get('layout') ?? 'four',
    grade: query.get('grade') ?? 'vice',
    title: query.get('title') ?? 'SUNSET HEIST',
    subtitle: query.get('subtitle') ?? 'a neon coast story',
    badge: query.get('badge') ?? 'NEON COAST',
    aspect: query.get('aspect') ?? 'square',
    autoexport: query.get('autoexport') ?? null,
  };
}

/** Parses an autoexport value such as "1080x1350" into {w, h}, or null. */
export function parseExportSize(value) {
  if (!value) return null;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return null;
  return { w: Number(match[1]), h: Number(match[2]) };
}

/** Marks the scene ready after two animation frames, once paint has landed. */
export function markReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
