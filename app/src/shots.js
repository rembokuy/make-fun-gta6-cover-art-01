// Shot scenes: how a URL query string drives the app for a screenshot.
//
// A shot URL like `?shot=cover&photos=pier,boulevard&layout=four&grade=vice`
// sets the editor up as a scene, so the screenshot scripts can capture a
// cover or the editor exactly as specified without clicking anything.

/**
 * Read the scene out of a query string. Every field has a default, so a
 * plain editor URL is itself a scene (the editor, pier photo, defaults).
 */
export function sceneFromQuery(query) {
  const params = new URLSearchParams(query);
  const photos = (params.get('photos') || 'pier').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    photos: photos.length > 0 ? photos : ['pier'],
    shot: params.get('shot') || 'editor',
    layout: params.get('layout') || 'four',
    grade: params.get('grade') || 'vice',
    title: params.get('title') || 'SUNSET HEIST',
    subtitle: params.get('subtitle') || 'a neon coast story',
    badge: params.get('badge') || 'NEON COAST',
    aspect: params.get('aspect') || 'square',
    autoexport: params.get('autoexport'),
  };
}

/** Parse "1080x1350" into { w, h }; anything else is not a size. */
export function parseExportSize(value) {
  if (!value) return null;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return null;
  return { w: Number.parseInt(match[1], 10), h: Number.parseInt(match[2], 10) };
}

/**
 * Tell the screenshot scripts the page is ready: set window.__shotReady
 * after two animation frames, so the first paint has actually happened.
 */
export function markReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
