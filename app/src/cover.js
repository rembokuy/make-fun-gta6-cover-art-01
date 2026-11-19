// Neon Coast cover renderer: draws one cover onto a 2D canvas at any size.
//
// The pipeline runs in order: graded photos into their panels, then the
// lettering band (halftone dots, big Anton title, Pacifico subtitle), then
// the corner ribbon, then grain and vignette. Everything is sized from W and
// H, so the same code draws the on-screen preview and the exported PNGs.
//
// A "design" is a plain object:
//   { layout, grade, title, subtitle, badge, grain, vignette, halftone,
//     panels: [{ photo, zoom, ox, oy }, ...] }
// where panels[i] belongs to layout slot i, `photo` is an index into the
// photos array (or -1 for an empty slot), `zoom` is a scale factor and ox/oy
// pan the photo inside its panel as a fraction of the panel size.

import { applyLut, buildLut, gradeById } from './grades.js';
import { panelRects } from './layouts.js';

// Graded copies of photos, keyed by photo index + grade, so dragging a panel
// only re-draws an already graded image instead of re-grading every frame.
const gradedCache = new Map();

/** The grade-applied copy of one photo, downscaled to at most 1400 px. */
function gradedImage(photo, photoIndex, gradeId) {
  const key = `${photoIndex}|${gradeId}`;
  const hit = gradedCache.get(key);
  if (hit) return hit;
  const scale = Math.min(1, 1400 / Math.max(photo.naturalWidth, photo.naturalHeight));
  const w = Math.max(2, Math.round(photo.naturalWidth * scale));
  const h = Math.max(2, Math.round(photo.naturalHeight * scale));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const offCtx = off.getContext('2d');
  offCtx.drawImage(photo, 0, 0, w, h);
  const lut = buildLut(gradeById(gradeId));
  offCtx.putImageData(applyLut(offCtx.getImageData(0, 0, w, h), lut), 0, 0);
  if (gradedCache.size > 12) gradedCache.clear();
  gradedCache.set(key, off);
  return off;
}

// One shared grain tile: random grey specks on a small canvas, tiled over
// the cover with the overlay composite at low alpha.
let grainTile = null;
function grainPattern(ctx) {
  if (grainTile) return ctx.createPattern(grainTile, 'repeat');
  const tile = document.createElement('canvas');
  tile.width = 140;
  tile.height = 140;
  const tctx = tile.getContext('2d');
  const img = tctx.createImageData(140, 140);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 64);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  grainTile = tile;
  return ctx.createPattern(tile, 'repeat');
}

/** How tall the lettering band is, as a share of the cover height. */
export function titleBandHeight(H) {
  return Math.round(H * 0.22);
}

/** Draws one photo, cover-fit, inside a panel rect, honouring zoom and pan. */
function paintPhoto(ctx, graded, rect, slot) {
  const zoom = slot.zoom ?? 1;
  const base = Math.max(rect.w / graded.width, rect.h / graded.height);
  const s = base * zoom;
  const dw = graded.width * s;
  const dh = graded.height * s;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const cx = Math.max(-slackX, Math.min(slackX, (slot.ox ?? 0) * rect.w));
  const cy = Math.max(-slackY, Math.min(slackY, (slot.oy ?? 0) * rect.h));
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  ctx.drawImage(graded, rect.x + (rect.w - dw) / 2 + cx, rect.y + (rect.h - dh) / 2 + cy, dw, dh);
  ctx.restore();
}

/** The "empty slot" placeholder: dark fill, dashed edge, a prompt. */
function paintEmpty(ctx, rect) {
  const fill = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  fill.addColorStop(0, '#2c1745');
  fill.addColorStop(1, '#180a28');
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = Math.max(1.5, rect.w * 0.006);
  ctx.setLineDash([rect.w * 0.03, rect.w * 0.02]);
  ctx.strokeRect(rect.x + rect.w * 0.04, rect.y + rect.h * 0.04, rect.w * 0.92, rect.h * 0.92);
  ctx.restore();
  const size = Math.min(rect.w, rect.h) * 0.11;
  ctx.font = `${Math.round(size)}px Anton, 'Arial Narrow', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText('+ ADD PHOTO', rect.x + rect.w / 2, rect.y + rect.h / 2);
}

/** A white polaroid frame around a tilted snapshot, with a soft shadow. */
function paintPolaroid(ctx, rect, slot, graded) {
  const border = rect.w * 0.035;
  const strip = rect.h * 0.13;
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
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
    paintPhoto(ctx, graded, { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h }, slot);
  }
  ctx.restore();
}

/** Halftone dots across the lettering band, fading toward the right. */
function paintHalftone(ctx, W, bandY, bandH) {
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
function paintLettering(ctx, W, H, design) {
  const bandH = titleBandHeight(H);
  const bandY = H - bandH;

  if (design.layout === 'full') {
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
    if (design.halftone) paintHalftone(ctx, W, bandY, bandH);
  }

  const title = (design.title || '').trim().toUpperCase();
  const subtitle = (design.subtitle || '').trim();
  const subY = bandY + bandH * 0.26;
  const baseline = bandY + bandH * 0.82;

  if (subtitle) {
    ctx.font = `${Math.round(bandH * 0.2)}px Pacifico, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(subtitle, W / 2, subY);
  }

  if (title) {
    let size = Math.round(bandH * 0.56);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const fits = () => {
      ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
      return ctx.measureText(title).width <= W * 0.92;
    };
    while (size > 16 && !fits()) size -= 2;
    ctx.font = `${size}px Anton, 'Arial Narrow', sans-serif`;
    // A cyan/pink offset print behind the white face: the genre-lettering look.
    const dx = Math.max(2, size * 0.035);
    ctx.fillStyle = '#22d3ee';
    ctx.fillText(title, W / 2 - dx, baseline);
    ctx.fillStyle = '#ff2e88';
    ctx.fillText(title, W / 2 + dx, baseline);
    ctx.lineWidth = Math.max(2, size * 0.07);
    ctx.strokeStyle = '#12081f';
    ctx.lineJoin = 'round';
    ctx.strokeText(title, W / 2, baseline);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(title, W / 2, baseline);
  }
}

/** The diagonal ribbon across the top-right corner, carrying the badge text. */
function paintRibbon(ctx, W, H, design) {
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
    const graded = img ? gradedImage(img, slot.photo, design.grade) : null;
    if (rect.backdrop) {
      if (graded) paintPhoto(ctx, graded, rect, { ...slot, zoom: Math.max(slot.zoom ?? 1, 1.05) });
      else paintEmpty(ctx, rect);
      return;
    }
    if (rect.frame) {
      paintPolaroid(ctx, rect, slot, graded);
      return;
    }
    if (graded) paintPhoto(ctx, graded, rect, slot);
    else paintEmpty(ctx, rect);
    if (i === selected) {
      ctx.save();
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(3, W * 0.004);
      ctx.strokeRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4);
      ctx.restore();
    }
  });

  paintLettering(ctx, W, H, design);
  paintRibbon(ctx, W, H, design);

  if (design.grain) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grainPattern(ctx);
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
