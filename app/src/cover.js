// Cover renderer: draws the whole poster onto a 2D canvas context.
// Order: violet backdrop -> photo panels -> lettering band -> badge ribbon
// -> film grain -> vignette.

import { panelRects } from "./layouts.js";
import { applyLut, buildLut, findGrade } from "./grades.js";

export function titleBandHeight(H) {
  return Math.round(H * 0.22);
}

const CYAN = "#22d3ee";
const PINK = "#ff2e88";
const GOLD = "#ffd166";
const DARK = "#12081f";

// Cache of graded photos: key is "photoIndex:gradeId", at most 12 entries.
// Each entry is a downscaled (max 1400 px) canvas already graded.
const gradedCache = new Map();

function gradedPhoto(photo, photoIndex, gradeId) {
  const key = `${photoIndex}:${gradeId}`;
  const hit = gradedCache.get(key);
  if (hit) return hit;

  const scale = Math.min(1, 1400 / Math.max(photo.width, photo.height));
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

  gradedCache.set(key, canvas);
  if (gradedCache.size > 12) {
    gradedCache.delete(gradedCache.keys().next().value);
  }
  return canvas;
}

// Draw one photo into a rect with cover-fit, zoom and pan. ox/oy are
// fractions of the panel size, clamped to the slack the zoom leaves.
function drawPhotoInto(ctx, img, rect, zoom, ox, oy) {
  const scale = Math.max(rect.w / img.width, rect.h / img.height) * zoom;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const dx = rect.x + (rect.w - dw) / 2 - ox * slackX;
  const dy = rect.y + (rect.h - dh) / 2 - oy * slackY;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawEmptyPanel(ctx, rect) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  grad.addColorStop(0, "#2c1745");
  grad.addColorStop(1, "#180a28");
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.save();
  ctx.strokeStyle = "rgba(244,238,251,0.55)";
  ctx.lineWidth = Math.max(1, rect.w * 0.008);
  ctx.setLineDash([Math.max(4, rect.w * 0.03), Math.max(4, rect.w * 0.03)]);
  ctx.strokeRect(rect.x + rect.w * 0.06, rect.y + rect.h * 0.06, rect.w * 0.88, rect.h * 0.88);
  ctx.restore();
  ctx.fillStyle = "rgba(244,238,251,0.75)";
  ctx.font = `600 ${Math.max(12, Math.round(rect.w * 0.07))}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("+ ADD PHOTO", rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function drawPolaroid(ctx, rect, drawInner) {
  const border = rect.w * 0.035;
  const strip = rect.h * 0.13;
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate(((rect.rot || 0) * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = rect.w * 0.06;
  ctx.shadowOffsetY = rect.w * 0.03;
  ctx.fillStyle = "#f8f4ec";
  ctx.fillRect(-rect.w / 2, -rect.h / 2, rect.w, rect.h);
  ctx.restore();
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate(((rect.rot || 0) * Math.PI) / 180);
  ctx.beginPath();
  ctx.rect(-rect.w / 2 + border, -rect.h / 2 + border, rect.w - 2 * border, rect.h - border - strip);
  ctx.clip();
  drawInner(
    -rect.w / 2 + border,
    -rect.h / 2 + border,
    rect.w - 2 * border,
    rect.h - border - strip
  );
  ctx.restore();
}

function fitFont(ctx, text, maxWidth, startSize, family, minSize = 16) {
  let size = startSize;
  ctx.font = `${size}px ${family}`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${size}px ${family}`;
  }
  return size;
}

function drawLettering(ctx, W, H, design) {
  const bandH = titleBandHeight(H);
  const bandY = H - bandH;
  const isFull = design.layout === "full";

  if (isFull) {
    const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
    scrim.addColorStop(0, "rgba(18,6,34,0)");
    scrim.addColorStop(1, "rgba(18,6,34,0.88)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  } else {
    const band = ctx.createLinearGradient(0, bandY, 0, H);
    band.addColorStop(0, "#22103c");
    band.addColorStop(1, "#12081f");
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY, W, bandH);

    if (design.halftone) {
      const step = Math.max(7, Math.round(W * 0.011));
      for (let y = bandY + step; y < H - step * 0.5; y += step) {
        for (let x = step; x < W; x += step) {
          const fade = 1 - x / W;
          ctx.fillStyle = `rgba(255,90,180,${(0.3 * fade).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1, step * 0.16), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const cx = W / 2;
  const subSize = Math.round(bandH * 0.26);
  const subY = bandY + bandH * 0.26;
  ctx.font = `${subSize}px Pacifico, cursive`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = GOLD;
  ctx.fillText(design.subtitle || "", cx, subY);

  const titleSize = fitFont(
    ctx,
    design.title || "",
    W * 0.92,
    Math.round(bandH * 0.56),
    "Anton, sans-serif"
  );
  const titleY = bandY + bandH * 0.66;
  const off = Math.max(1, titleSize * 0.035);
  ctx.font = `${titleSize}px Anton, sans-serif`;
  ctx.lineWidth = Math.max(1, titleSize * 0.07);
  ctx.strokeStyle = DARK;
  ctx.lineJoin = "round";
  ctx.fillStyle = CYAN;
  ctx.fillText(design.title || "", cx - off, titleY);
  ctx.fillStyle = PINK;
  ctx.fillText(design.title || "", cx + off, titleY);
  ctx.strokeText(design.title || "", cx, titleY);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(design.title || "", cx, titleY);
}

function drawRibbon(ctx, W, H, badge) {
  const m = Math.min(W, H);
  const h = H * 0.045;
  const len = m * 0.62;
  const cx = W - m * 0.15;
  const cy = m * 0.15;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  const grad = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
  grad.addColorStop(0, PINK);
  grad.addColorStop(1, "#ff7a18");
  ctx.fillStyle = grad;
  ctx.fillRect(-len / 2, -h / 2, len, h);
  ctx.fillStyle = "#ffffff";
  ctx.font = `${Math.round(h * 0.52)}px Anton, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(`★ ${badge} ★`, 0, 1);
  ctx.restore();
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement("canvas");
  tile.width = 140;
  tile.height = 140;
  const c = tile.getContext("2d");
  const data = c.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 64);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  c.putImageData(data, 0, 0);
  grainTile = tile;
  return tile;
}

export function renderCover(ctx, W, H, design, photos, selected = -1) {
  // (1) Violet radial backdrop.
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, "#2a1145");
  bg.addColorStop(1, "#12081f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // (2) Photo panels.
  const bandH = titleBandHeight(H);
  const rects = panelRects(design.layout, W, H, bandH);
  rects.forEach((rect, i) => {
    const panel = design.panels[i] || { photo: -1, zoom: 1, ox: 0, oy: 0 };
    const photo = panel.photo >= 0 ? photos[panel.photo] : null;

    const paint = (x, y, w, h) => {
      if (photo) {
        const graded = gradedPhoto(photo, panel.photo, design.grade);
        drawPhotoInto(ctx, graded, { x, y, w, h }, panel.zoom, panel.ox, panel.oy);
      } else {
        drawEmptyPanel(ctx, { x, y, w, h });
      }
    };

    ctx.save();
    if (rect.backdrop) {
      paint(rect.x, rect.y, rect.w, rect.h);
    } else if (rect.frame) {
      drawPolaroid(ctx, rect, (x, y, w, h) => {
        // drawInner runs inside the polaroid's rotated frame; coordinates
        // are relative to the rotated origin, so paint in local space.
        ctx.save();
        ctx.translate(x, y);
        if (photo) {
          const graded = gradedPhoto(photo, panel.photo, design.grade);
          drawPhotoInto(ctx, graded, { x: 0, y: 0, w, h }, panel.zoom, panel.ox, panel.oy);
        } else {
          drawEmptyPanel(ctx, { x: 0, y: 0, w, h });
        }
        ctx.restore();
      });
    } else {
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      paint(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();

    // Selection ring — never drawn for clean cover screenshots (selected -1).
    if (selected === i && !rect.backdrop) {
      ctx.save();
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = Math.max(3, W * 0.006);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
  });

  // (3) Lettering.
  drawLettering(ctx, W, H, design);

  // (4) Badge ribbon.
  if (design.badge) drawRibbon(ctx, W, H, design.badge);

  // (5) Film grain.
  if (design.grain) {
    const tile = getGrainTile();
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.globalCompositeOperation = "overlay";
    const pattern = ctx.createPattern(tile, "repeat");
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // (6) Vignette.
  if (design.vignette) {
    const vg = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.35,
      W / 2, H / 2, Math.max(W, H) * 0.75
    );
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }
}
