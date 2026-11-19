// Neon Coast cover renderer: draws one cover onto a 2D canvas at any size.
// The pipeline is: graded photos into their panels, then the lettering band
// (halftone dots, big Anton title, Pacifico subtitle), then the corner ribbon,
// then grain and vignette. Everything is sized from W and H, so the same code
// draws the on-screen preview and the exported PNGs.
//
// A "design" is a plain object:
//   { layout, grade, title, subtitle, badge, grain, vignette, halftone,
//     panels: [{ photo, zoom, ox, oy }, ...] }
// where panels[i] belongs to layout slot i, `photo` is an index into the
// photos array (or -1 for an empty slot), `zoom` is a scale factor and ox/oy
// pan the photo inside its panel as a fraction of the panel size.

import { applyLut, buildLut, gradeById } from './grades.js';
import { layoutById, panelRects } from './layouts.js';

// Graded copies of photos, keyed by photo index + grade, so dragging a panel
// only re-draws an already graded image instead of re-grading every frame.
const gradedCache = new Map();

function gradedPhoto(photo, photoIndex, gradeId) {
  const key = `${photoIndex}|${gradeId}`;
  const hit = gradedCache.get(key);
  if (hit) return hit;
  const cap = 1400;
  const scale = Math.min(1, cap / Math.max(photo.naturalWidth, photo.naturalHeight));
  const w = Math.max(2, Math.round(photo.naturalWidth * scale));
  const h = Math.max(2, Math.round(photo.naturalHeight * scale));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  ctx.drawImage(photo, 0, 0, w, h);
  const lut = buildLut(gradeById(gradeId));
  ctx.putImageData(applyLut(ctx.getImageData(0, 0, w, h), lut), 0, 0);
  if (gradedCache.size > 12) gradedCache.clear();
  gradedCache.set(key, off);
  return off;
}

// One shared grain tile: random grey specks on a small canvas, tiled over the
// cover with the overlay composite at low alpha.
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 140;
  tile.height = 140;
  const ctx = tile.getContext('2d');
  const img = ctx.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 64);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainTile = tile;
  return tile;
}

/** How tall the lettering band is, as a share of the cover height. */
export function titleBandHeight(H) {
  return Math.round(H * 0.22);
}

/** Draws one photo, cover-fit, inside a panel rect, honouring zoom and pan. */
function drawPhotoInPanel(ctx, graded, rect, slot) {
  const { x, y, w, h } = rect;
  const zoom = slot.zoom ?? 1;
  const iw = graded.width;
  const ih = graded.height;
  const base = Math.max(w / iw, h / ih);
  const s = base * zoom;
  const dw = iw * s;
  const dh = ih * s;
  const maxOx = Math.max(0, (dw - w) / 2);
  const maxOy = Math.max(0, (dh - h) / 2);
  const cx = Math.max(-maxOx, Math.min(maxOx, (slot.ox ?? 0) * w));
  const cy = Math.max(-maxOy, Math.min(maxOy, (slot.oy ?? 0) * h));
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(graded, x + (w - dw) / 2 + cx, y + (h - dh) / 2 + cy, dw, dh);
  ctx.restore();
}

/** Draws the "empty slot" placeholder: dark fill, dashed edge, a prompt. */
function drawEmptyPanel(ctx, rect) {
  const { x, y, w, h } = rect;
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#2c1745');
  grad.addColorStop(1, '#180a28');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = Math.max(1.5, w * 0.006);
  ctx.setLineDash([w * 0.03, w * 0.02]);
  ctx.strokeRect(x + w * 0.04, y + h * 0.04, w * 0.92, h * 0.92);
  ctx.restore();
  const size = Math.min(w, h) * 0.11;
  ctx.font = `${Math.round(size)}px Anton, 'Arial Narrow', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('+ ADD PHOTO', x + w / 2, y + h / 2);
}

/** A white polaroid frame around a tilted snapshot, with a soft shadow. */
function drawPolaroid(ctx, rect, slot, graded, photos, design) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const border = rect.w * 0.035;
  const strip = rect.h * 0.13;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((rect.rot ?? 0) * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = rect.w * 0.06;
  ctx.shadowOffsetY = rect.w * 0.03;
  ctx.fillStyle = '#f7f2e8';
  ctx.fillRect(-rect.w / 2 - border, -rect.h / 2 - border, rect.w + border * 2, rect.h + border + strip);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  if (graded) {
    drawPhotoInPanel(
      ctx,
      graded,
      { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h },
      slot,
    );
  }
  ctx.restore();
}

/** Halftone dots across the lettering band, fading toward the right. */
function drawHalftone(ctx, W, bandY, bandH) {
  const step = Math.max(10, bandH * 0.16);
  ctx.save();
  for (let yy = bandY + step / 2; yy < bandY + bandH; yy += step) {
    for (let xx = step / 2; xx < W; xx += step) {
      const wave = 0.5 + 0.5 * Math.sin(xx * 0.012 + yy * 0.02);
      const r = step * (0.08 + wave * 0.22) * (1 - (xx / W) * 0.45);
      ctx.fillStyle = 'rgba(255, 90, 180, 0.30)';
      ctx.beginPath();
      ctx.arc(xx, yy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** The big title, subtitle and lettering band along the foot of the cover. */
function drawLettering(ctx, W, H, design) {
  const bandH = titleBandHeight(H);
  const bandY = H - bandH;
  const layout = design.layout;

  if (layout === 'full') {
    const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
    scrim.addColorStop(0, 'rgba(18, 6, 34, 0)');
    scrim.addColorStop(1, 'rgba(18, 6, 34, 0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  } else {
    const band = ctx.createLinearGradient(0, bandY, 0, H);
    band.addColorStop(0, '#22103c');
    band.addColorStop(1, '#12081f');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandY, W, bandH);
    if (design.halftone) drawHalftone(ctx, W, bandY, bandH);
  }

  const title = (design.title || '').trim().toUpperCase();
  const subtitle = (design.subtitle || '').trim();
  const subY = bandY + bandH * 0.26;
  const titleBaseline = bandY + bandH * 0.82;

  if (subtitle) {
    const subSize = Math.round(bandH * 0.2);
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(subtitle, W / 2, subY);
  }

  if (title) {
    let size = Math.round(bandH * 0.56);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const fit = () => {
      ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
      return ctx.measureText(title).width <= W * 0.92;
    };
    while (size > 16 && !fit()) size -= 2;
    ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
    const dx = Math.max(2, size * 0.035);
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(title, W / 2 - dx, titleBaseline);
    ctx.fillStyle = '#ff2e88';
    ctx.fillText(title, W / 2 + dx, titleBaseline);
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.strokeStyle = '#12081f';
    ctx.lineJoin = 'round';
    ctx.strokeText(title, W / 2, titleBaseline);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, W / 2, titleBaseline);
  }
}

/** The diagonal ribbon across the top-right corner, carrying the badge text. */
function drawRibbon(ctx, W, H, design) {
  const badge = (design.badge || '').trim().toUpperCase();
  if (!badge) return;
  const bandH = Math.max(18, Math.round(H * 0.045));
  // The band's centre sits `a` pixels in from the corner along both edges, so
  // the band enters through the top edge and leaves through the right edge.
  const a = Math.round(Math.min(W, H) * 0.15);
  const len = a * 2.4;
  ctx.save();
  ctx.translate(W - a, a);
  ctx.rotate(Math.PI / 4);
  const grad = ctx.createLinearGradient(-len, 0, len, 0);
  grad.addColorStop(0, '#ff2e88');
  grad.addColorStop(1, '#ff7a18');
  ctx.fillStyle = grad;
  ctx.fillRect(-len, -bandH / 2, len * 2, bandH);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-len, bandH / 2 - Math.max(2, bandH * 0.12), len * 2, Math.max(2, bandH * 0.12));
  ctx.font = `${Math.round(bandH * 0.52)}px Anton, 'Arial Narrow', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`★ ${badge} ★`, 0, 1);
  ctx.restore();
}

/**
 * Draws the whole cover. `photos` is an array of loaded images; `design`
 * holds the layout, grade, texts and per-slot transforms. `selected` is the
 * index of the panel the editor has selected, or -1; the editor draws a
 * highlight ring around it.
 */
export function renderCover(ctx, W, H, design, photos, selected = -1) {
  const bandH = titleBandHeight(H);
  const bg = ctx.createRadialGradient(W / 2, H * 0.3, 10, W / 2, H * 0.45, Math.max(W, H) * 0.75);
  bg.addColorStop(0, '#2a1145');
  bg.addColorStop(1, '#12081f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rects = panelRects(design.layout, W, H, bandH);
  rects.forEach((rect, i) => {
    const slot = design.panels[i] ?? { photo: -1, zoom: 1, ox: 0, oy: 0 };
    const img = slot.photo >= 0 ? photos[slot.photo] : null;
    if (rect.backdrop) {
      if (img) {
        const graded = gradedPhoto(img, slot.photo, design.grade);
        drawPhotoInPanel(ctx, graded, rect, { ...slot, zoom: Math.max(slot.zoom ?? 1, 1.05) });
      } else {
        drawEmptyPanel(ctx, rect);
      }
      return;
    }
    if (rect.frame) {
      const graded = img ? gradedPhoto(img, slot.photo, design.grade) : null;
      drawPolaroid(ctx, rect, slot, graded, photos, design);
      return;
    }
    if (img) {
      drawPhotoInPanel(ctx, gradedPhoto(img, slot.photo, design.grade), rect, slot);
    } else {
      drawEmptyPanel(ctx, rect);
    }
    if (i === selected) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(3, W * 0.004);
      ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
      ctx.restore();
    }
  });

  drawLettering(ctx, W, H, design);
  drawRibbon(ctx, W, H, design);

  if (design.grain) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(getGrainTile(), 'repeat');
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  if (design.vignette) {
    const vig = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.42,
      W / 2, H / 2, Math.max(W, H) * 0.72,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
}
