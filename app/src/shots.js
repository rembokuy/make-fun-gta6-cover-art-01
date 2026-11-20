// Scene parsing for scripted screenshots (shots.json).
// A scene comes from the page's query string: which photos, which shot,
// layout, grade, lettering, aspect, and an optional auto-export size.

export function sceneFromQuery(query) {
  const params = new URLSearchParams(query);
  const photos = (params.get('photos') ?? 'pier').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    photos: photos.length > 0 ? photos : ['pier'],
    shot: params.get('shot') ?? 'editor',
    layout: params.get('layout') ?? 'four',
    grade: params.get('grade') ?? 'vice',
    title: params.get('title') ?? 'SUNSET HEIST',
    subtitle: params.get('subtitle') ?? 'a neon coast story',
    badge: params.get('badge') ?? 'NEON COAST',
    aspect: params.get('aspect') ?? 'square',
    autoexport: params.get('autoexport'),
  };
}

// Parse a "WxH" size string, or null when it is not one.
export function parseExportSize(value) {
  if (!value) return null;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return null;
  return { w: Number.parseInt(match[1], 10), h: Number.parseInt(match[2], 10) };
}

// Tell the screenshot runner the page is ready, after two animation frames
// so the first paint has settled.
export function markReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
