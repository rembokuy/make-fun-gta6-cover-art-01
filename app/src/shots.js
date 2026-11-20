// Screenshot scenes: read the design from the URL query string so the
// shot script can open a deterministic editor or cover state.

export function sceneFromQuery(query) {
  const params = new URLSearchParams(query);
  const photos = (params.get("photos") || "pier").split(",").filter(Boolean);
  return {
    photos,
    shot: params.get("shot") || "editor",
    layout: params.get("layout") || "four",
    grade: params.get("grade") || "vice",
    title: params.get("title") || "SUNSET HEIST",
    subtitle: params.get("subtitle") || "a neon coast story",
    badge: params.get("badge") || "NEON COAST",
    aspect: params.get("aspect") || "square",
    autoexport: params.get("autoexport") || null,
  };
}

// "1080x1350" -> {w: 1080, h: 1350}; anything else -> null.
export function parseExportSize(value) {
  if (!value) return null;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return null;
  return { w: Number(match[1]), h: Number(match[2]) };
}

// Tell the shot script the page has rendered: two animation frames after
// the caller asks, so paint has actually happened.
export function markReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
