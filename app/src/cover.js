// The cover renderer for Neon Coast Cover Studio.
// renderCover draws one complete cover onto a 2D context; graded photos
// are cached per (photo + grade) and downscaled to at most 1400 px wide.

import { buildLut, applyLut, findGrade } from './grades.js';
import { panelRects } from './layouts.js';

export function titleBandHeight(H) {
  return Math.round(H * 0.22);
}

const gradeCache = new Map();
const MAX_CACHE = 12;
const MAX_PHOTO_PX = 1400;

// Return a canvas holding `photo` recoloured with `gradeId`, cached by
// photo object + grade, oldest entries dropped past the cache cap.
function gradedPhoto(photo, gradeId) {
  const key = `${photo.__ncId ?? (photo.__ncId = Math.random().toString(36).slice(2))}:${gradeId}`;
  const hit = gradeCache.get(key);
  if (hit) return hit;
  const scale = Math.min(1, MAX_PHOTO_PX / Math.max(photo.naturalWidth, photo.naturalHeight));
  const w = Math.max(1, Math.round(photo.naturalWidth * scale));
  const h = Math.max(1, Math.round(photo.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  applyLut(imageData, buildLut(findGrade(gradeId)));
  ctx.putImageData(imageData, 0, 0);
  gradeCache.set(key, canvas);
  while (gradeCache.size > MAX_CACHE) {
    gradeCache.delete(gradeCache.keys().next().value);
  }
  return canvas;
}

// Draw one photo cover-fit inside a panel rect, with zoom and pan.
// ox/oy are fractions of the panel size, clamped to the slack the zoom
// leaves; at zoom 1 there is no slack and the photo stays centred.
function drawPhotoInto(ctx, image, rect, zoom, ox, oy) {
  const scale = Math.max(rect.w / image.width, rect.h / image.height) * zoom;
  const dw = image.width * scale;
  const dh = image.height * scale;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const px = Math.max(-slackX, Math.min(slackX, ox * rect.w));
  const py = Math.max(-slackY, Math.min(slackY, oy * rect.h));
  ctx.drawImage(image, rect.x + (rect.w - dw) / 2 + px, rect.y + (rect.h - dh) / 2 + py, dw, dh);
}

function drawEmptyPanel(ctx, rect) {
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  grad.addColorStop(0, '#2c1745');
  grad.addColorStop(1, '#180a28');
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.save();
  ctx.strokeStyle = 'rgba(244, 238, 251, 0.55)';
  ctx.lineWidth = Math.max(1, rect.w * 0.01);
  ctx.setLineDash([Math.max(4, rect.w * 0.04), Math.max(4, rect.w * 0.03)]);
  ctx.strokeRect(rect.x + 6, rect.y + 6, rect.w - 12, rect.h - 12);
  ctx.restore();
  ctx.fillStyle = 'rgba(244, 238, 251, 0.8)';
  ctx.font = `600 ${Math.max(12, Math.round(rect.w * 0.07))}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('+ ADD PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
}

function drawLettering(ctx, W, H, design) {
  const bandH = titleBandHeight(H);
  const bandY = H - bandH;
  const grad = ctx.createLinearGradient(0, bandY, 0, H);
  grad.addColorStop(0, '#22103c');
  grad.addColorStop(1, '#12081f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bandY, W, bandH);

  if (design.halftone) {
    const step = Math.max(10, Math.round(W * 0.014));
    for (let y = bandY + step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) {
        const fade = 1 - x / W;
        ctx.fillStyle = `rgba(255, 90, 180, ${0.30 * fade})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.2, step * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  const pad = Math.round(W * 0.045);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const subSize = Math.max(14, Math.round(bandH * 0.26));
  ctx.font = `${subSize}px Pacifico, cursive`;
  ctx.fillStyle = '#ffd166';
  ctx.fillText(design.subtitle || '', pad, bandY + bandH * 0.34);

  let titleSize = Math.round(bandH * 0.56);
  const title = design.title || '';
  ctx.font = `${titleSize}px Anton, sans-serif`;
  while (titleSize > 16 && ctx.measureText(title).width > W * 0.92) {
    titleSize -= 2;
    ctx.font = `${titleSize}px Anton, sans-serif`;
  }
  const off = Math.round(titleSize * 0.035);
  const titleY = bandY + bandH * 0.88;
  ctx.fillStyle = '#22d3ee';
  ctx.fillText(title, pad - off, titleY);
  ctx.fillStyle = '#ff2e88';
  ctx.fillText(title, pad + off, titleY);
  ctx.lineWidth = Math.max(2, Math.round(titleSize * 0.07));
  ctx.strokeStyle = '#12081f';
  ctx.strokeText(title, pad, titleY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(title, pad, titleY);
}

function drawRibbon(ctx, W, H, design) {
  const bandH = Math.round(H * 0.045);
  const centre = Math.round(Math.min(W, H) * 0.15);
  ctx.save();
  ctx.translate(W - centre, centre);
  ctx.rotate(Math.PI / 4);
  const grad = ctx.createLinearGradient(-W, 0, W, 0);
  grad.addColorStop(0, '#ff2e88');
  grad.addColorStop(1, '#ff7a18');
  ctx.fillStyle = grad;
  ctx.fillRect(-W, -bandH / 2, W * 2, bandH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.max(12, Math.round(bandH * 0.52))}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`★ ${design.badge || ''} ★`, 0, 1);
  ctx.restore();
}

let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 140;
  tile.height = 140;
  const tctx = tile.getContext('2d');
  const imageData = tctx.createImageData(140, 140);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 64);
    imageData.data[i] = v;
    imageData.data[i + 1] = v;
    imageData.data[i + 2] = v;
    imageData.data[i + 3] = 255;
  }
  tctx.putImageData(imageData, 0, 0);
  grainTile = tile;
  return tile;
}

export function renderCover(ctx, W, H, design, photos, selected = -1) {
  const bandH = titleBandHeight(H);
  const fullBleed = design.layout === 'full';

  // (1) Background: a radial violet gradient.
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.72);
  bg.addColorStop(0, '#2a1145');
  bg.addColorStop(1, '#12081f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // (2) Panels.
  const rects = panelRects(design.layout, W, H, fullBleed ? 0 : bandH);
  rects.forEach((rect, i) => {
    const panel = design.panels[i] ?? { photo: -1, zoom: 1, ox: 0, oy: 0 };
    const photo = panel.photo >= 0 ? photos[panel.photo] : null;
    if (rect.backdrop) {
      if (photo) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        ctx.clip();
        drawPhotoInto(ctx, gradedPhoto(photo, design.grade), rect, panel.zoom, panel.ox, panel.oy);
        ctx.restore();
      }
      return;
    }
    ctx.save();
    if (rect.rot) {
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate((rect.rot * Math.PI) / 180);
      ctx.translate(-rect.w / 2, -rect.h / 2);
    } else {
      ctx.translate(rect.x, rect.y);
    }
    const local = { x: 0, y: 0, w: rect.w, h: rect.h };
    if (rect.frame) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = Math.round(rect.w * 0.05);
      ctx.shadowOffsetY = Math.round(rect.h * 0.03);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -2, rect.w + 4, rect.h + 4);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      const border = rect.w * 0.035;
      const strip = rect.h * 0.13;
      const inner = { x: border, y: border, w: rect.w - border * 2, h: rect.h - border - strip };
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.w, inner.h);
      ctx.clip();
      if (photo) drawPhotoInto(ctx, gradedPhoto(photo, design.grade), inner, panel.zoom, panel.ox, panel.oy);
      else drawEmptyPanel(ctx, inner);
      ctx.restore();
    } else {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, rect.w, rect.h);
      ctx.clip();
      if (photo) drawPhotoInto(ctx, gradedPhoto(photo, design.grade), local, panel.zoom, panel.ox, panel.oy);
      else drawEmptyPanel(ctx, local);
      ctx.restore();
    }
    if (i === selected) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(3, Math.round(rect.w * 0.012));
      ctx.strokeRect(0, 0, rect.w, rect.h);
    }
    ctx.restore();
  });

  // (3) Lettering: a band at the foot, or a scrim for full bleed.
  if (fullBleed) {
    const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
    scrim.addColorStop(0, 'rgba(18, 6, 34, 0)');
    scrim.addColorStop(1, 'rgba(18, 6, 34, 0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, Math.round(H * 0.55), W, Math.round(H * 0.45));
    // Draw the title and subtitle over the scrim, in the same band area.
    const pad = Math.round(W * 0.045);
    const subSize = Math.max(14, Math.round(bandH * 0.26));
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.fillStyle = '#ffd166';
    ctx.fillText(design.subtitle || '', pad, H - bandH * 0.66);
    let titleSize = Math.round(bandH * 0.56);
    const title = design.title || '';
    ctx.font = `${titleSize}px Anton, sans-serif`;
    while (titleSize > 16 && ctx.measureText(title).width > W * 0.92) {
      titleSize -= 2;
      ctx.font = `${titleSize}px Anton, sans-serif`;
    }
    const off = Math.round(titleSize * 0.035);
    const titleY = H - bandH * 0.12;
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(title, pad - off, titleY);
    ctx.fillStyle = '#ff2e88';
    ctx.fillText(title, pad + off, titleY);
    ctx.lineWidth = Math.max(2, Math.round(titleSize * 0.07));
    ctx.strokeStyle = '#12081f';
    ctx.strokeText(title, pad, titleY);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, pad, titleY);
  } else {
    drawLettering(ctx, W, H, design);
  }

  // (4) Diagonal ribbon in the top-right corner.
  drawRibbon(ctx, W, H, design);

  // (5) Film grain.
  if (design.grain) {
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.globalCompositeOperation = 'overlay';
    const tile = getGrainTile();
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // (6) Vignette.
  if (design.vignette) {
    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
}
