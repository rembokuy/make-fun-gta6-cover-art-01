export function sceneFromQuery(query) {
  const params = new URLSearchParams(query);
  const photosParam = params.get("photos");
  const photos = photosParam
    ? photosParam.split(",").map((name) => name.trim()).filter(Boolean)
    : ["pier"];
  return {
    shot: params.get("shot") || "editor",
    photos,
    layout: params.get("layout") || "four",
    grade: params.get("grade") || "vice",
    title: params.get("title") || "SUNSET HEIST",
    subtitle: params.get("subtitle") || "a neon coast story",
    badge: params.get("badge") || "NEON COAST",
    aspect: params.get("aspect") || "square",
    autoexport: params.get("autoexport") || null,
  };
}

export function parseExportSize(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d+)x(\d+)$/.exec(value.trim());
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w <= 0 || h <= 0) return null;
  return { w, h };
}

export function markReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__shotReady = true;
    });
  });
}
