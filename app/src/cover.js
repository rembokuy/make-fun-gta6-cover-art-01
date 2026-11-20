import { panelRects } from "./layouts.js";
import { applyLut, buildLut, findGrade } from "./grades.js";

export const CYAN = "#22d3ee";
export const PINK = "#ff2e88";
export const GOLD = "#ffd166";
export const DARK = "#12081f";

export function titleBandHeight(H) {
  return Math.round(H * 0.22);
}

const gradeCache = new Map();

function gradedPhoto(photo, photoIndex, gradeId) {
  const key = `${photoIndex}:${gradeId}`;
  const hit = gradeCache.get(key);
  if (hit) return hit;
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(photo.width, photo.height));
  const w = Math.max(1, Math.round(photo.width * scale));
  const h = Math.max(1, Math.round(photo.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  c.drawImage(photo, 0, 0, w, h);
  const imageData = c.getImageData(0, 0, w, h);
  applyLut(imageData, buildLut(findGrade(gradeId)));
  c.putImageData(imageData, 0, 0);
  gradeCache.set(key, canvas);
  if (gradeCache.size > 12) {
    const oldest = gradeCache.keys().next().value;
    gradeCache.delete(oldest);
  }
  return canvas;
}

function drawPhotoInto(ctx, img, rect, panel) {
  const zoom = panel.zoom || 1;
  const scale = Math.max(rect.w / img.width, rect.h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const dx = rect.x + (rect.w - dw) / 2 - (panel.ox || 0) * slackX;
  const dy = rect.y + (rect.h - dh) / 2 - (panel.oy || 0) * slackY;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawEmptyPanel(ctx, rect) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  grad.addColorStop(0, "#2c1745");
  grad.addColorStop(1, "#180a28");
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const inset = Math.min(rect.w, rect.h) * 0.14;
  ctx.save();
  ctx.strokeStyle = "#b9a8d6";
  ctx.lineWidth = Math.max(1.5, rect.w * 0.004);
  ctx.setLineDash([10, 8]);
  ctx.strokeRect(rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2);
  ctx.restore();
  ctx.fillStyle = "#b9a8d6";
  ctx.font = `${Math.max(12, Math.round(rect.h * 0.07))}px Anton, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("+ ADD PHOTO", rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function drawBackdrop(ctx, W, H) {
  const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  grad.addColorStop(0, "#2a1145");
  grad.addColorStop(1, "#12081f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawGrain(ctx, W, H) {
  const tile = document.createElement("canvas");
  tile.width = 140;
  tile.height = 140;
  const tc = tile.getContext("2d");
  const data = tc.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 64);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  tc.putImageData(data, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.1;
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = ctx.createPattern(tile, "repeat");
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawVignette(ctx, W, H) {
  const grad = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.35,
    W / 2, H / 2, Math.max(W, H) * 0.75
  );
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
}

function drawHalftone(ctx, W, bandTop, bandH) {
  const spacing = Math.max(7, Math.round(W * 0.011));
  ctx.save();
  ctx.fillStyle = PINK;
  for (let x = spacing / 2; x < W; x += spacing) {
    const alpha = 0.34 * (1 - x / W);
    for (let y = bandTop + spacing / 2; y < bandTop + bandH; y += spacing) {
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, spacing * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBadge(ctx, W, H, badgeText) {
  if (!badgeText || !badgeText.trim()) return;
  const m = Math.min(W, H);
  const cx = W - 0.15 * m;
  const cy = 0.15 * m;
  const len = 0.62 * m;
  const thick = 0.045 * H;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, PINK);
  grad.addColorStop(1, "#ff7a18");
  ctx.fillStyle = grad;
  ctx.fillRect(-len / 2, -thick / 2, len, thick);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.round(thick * 0.55)}px Anton, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`★ ${badgeText} ★`, 0, 1);
  ctx.restore();
}

export function renderCover(ctx, W, H, design, photos, selected = -1) {
  const titleH = titleBandHeight(H);
  const bandTop = H - titleH;
  const rects = panelRects(design.layout, W, H, titleH);
  const isFull = design.layout === "full";

  drawBackdrop(ctx, W, H);

  // Backdrop rects are drawn full-bleed, without clipping.
  for (let i = 0; i < rects.length; i++) {
    if (!rects[i].backdrop) continue;
    const panel = design.panels[i];
    if (!panel || panel.photo < 0 || !photos[panel.photo]) continue;
    const img = gradedPhoto(photos[panel.photo], panel.photo, design.grade);
    drawPhotoInto(ctx, img, { x: 0, y: 0, w: W, h: H }, panel);
  }

  // Panels.
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const panel = design.panels[i] || { photo: -1, zoom: 1, ox: 0, oy: 0 };
    const photo = panel.photo >= 0 ? photos[panel.photo] : null;
    if (rect.frame) {
      const border = rect.w * 0.035;
      const strip = rect.h * 0.13;
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(((rect.rot || 0) * Math.PI) / 180);
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = Math.max(8, W * 0.02);
      ctx.shadowOffsetY = Math.max(4, H * 0.008);
      ctx.fillStyle = "#f8f4ec";
      ctx.fillRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const inner = {
        x: -rect.w / 2 + border,
        y: -rect.h / 2 + border,
        w: rect.w - border * 2,
        h: rect.h - border * 2 - strip,
      };
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.w, inner.h);
      ctx.clip();
      if (photo) {
        const img = gradedPhoto(photo, panel.photo, design.grade);
        drawPhotoInto(ctx, img, inner, panel);
      } else {
        drawEmptyPanel(ctx, inner);
      }
      ctx.restore();
      if (selected === i) {
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = Math.max(3, W * 0.006);
        ctx.strokeRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
      }
      ctx.restore();
      continue;
    }
    if (rect.backdrop && isFull) {
      // Full-bleed photo already drawn above; only the selection ring applies.
      if (selected === i) {
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = Math.max(3, W * 0.006);
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      }
      continue;
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    if (photo) {
      const img = gradedPhoto(photo, panel.photo, design.grade);
      drawPhotoInto(ctx, img, rect, panel);
    } else {
      drawEmptyPanel(ctx, rect);
    }
    ctx.restore();
    if (selected === i && !rect.backdrop) {
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = Math.max(3, W * 0.006);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
  }

  // Lettering.
  if (isFull) {
    const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
    scrim.addColorStop(0, "rgba(18,6,34,0)");
    scrim.addColorStop(1, "rgba(18,6,34,0.88)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  } else {
    const band = ctx.createLinearGradient(0, bandTop, 0, H);
    band.addColorStop(0, "#22103c");
    band.addColorStop(1, "#12081f");
    ctx.fillStyle = band;
    ctx.fillRect(0, bandTop, W, titleH);
    if (design.halftone) drawHalftone(ctx, W, bandTop, titleH);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = GOLD;
  ctx.font = `${Math.round(titleH * 0.26)}px Pacifico, cursive`;
  ctx.fillText(design.subtitle || "", W / 2, bandTop + titleH * 0.26);

  let fontSize = Math.round(titleH * 0.56);
  ctx.font = `${fontSize}px Anton, system-ui, sans-serif`;
  const maxTitleW = W * 0.92;
  while (fontSize > 16 && ctx.measureText(design.title || "").width > maxTitleW) {
    fontSize -= 2;
    ctx.font = `${fontSize}px Anton, system-ui, sans-serif`;
  }
  const titleY = bandTop + titleH * 0.66;
  const shift = Math.max(2, Math.round(fontSize * 0.06));
  ctx.font = `${fontSize}px Anton, system-ui, sans-serif`;
  ctx.fillStyle = CYAN;
  ctx.fillText(design.title || "", W / 2 - shift, titleY);
  ctx.fillStyle = PINK;
  ctx.fillText(design.title || "", W / 2 + shift, titleY);
  ctx.strokeStyle = DARK;
  ctx.lineWidth = Math.max(2, fontSize * 0.08);
  ctx.strokeText(design.title || "", W / 2, titleY);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(design.title || "", W / 2, titleY);

  drawBadge(ctx, W, H, design.badge);

  if (design.grain) drawGrain(ctx, W, H);
  if (design.vignette) drawVignette(ctx, W, H);
}
