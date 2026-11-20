// The renderer: turns a design and its photos into cover art on a canvas.
//
// renderCover(ctx, W, H, design, photos, selected) paints, in order: the
// violet backdrop, the photo panels (each graded), the lettering band,
// the diagonal badge ribbon, then grain and vignette. selected is the
// index of the panel to ring in cyan, or -1 for a clean render with no
// ring (screenshots and exports always pass -1).

import { findGrade, buildLut, applyLut } from './grades.js';
import { panelRects } from './layouts.js';

/** The lettering band's height: 22% of the cover height. */
export function titleBandHeight(H) {
  return Math.round(H * 0.22);
}

// Graded-photo cache: one graded canvas per (photo, grade), at most 12
// entries, oldest evicted first. Grading once per photo keeps a drag or a
// re-render cheap instead of re-grading every frame.
const gradeCache = new Map();
const GRADE_CACHE_MAX = 12;
const GRADE_MAX_SIDE = 1400;

/** The photo graded with `grade`, as a canvas (cached, downscaled to 1400px). */
function gradedPhoto(photo, index, grade) {
  const key = `${index}:${grade.id}`;
  const hit = gradeCache.get(key);
  if (hit) return hit;
  const scale = Math.min(1, GRADE_MAX_SIDE / Math.max(photo.naturalWidth, photo.naturalHeight));
  const w = Math.max(1, Math.round(photo.naturalWidth * scale));
  const h = Math.max(1, Math.round(photo.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  g.drawImage(photo, 0, 0, w, h);
  const lut = buildLut(grade);
  const data = g.getImageData(0, 0, w, h);
  applyLut(data, lut);
  g.putImageData(data, 0, 0);
  gradeCache.set(key, canvas);
  while (gradeCache.size > GRADE_CACHE_MAX) {
    gradeCache.delete(gradeCache.keys().next().value);
  }
  return canvas;
}

/**
 * Paint an image into a rectangle with cover fit: the image fills the
 * rectangle, cropped where it overflows. zoom scales it up; ox/oy pan it
 * as a fraction of the rectangle's size, clamped so no gap ever shows.
 */
function drawCoverFit(ctx, img, rect, zoom, ox, oy) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const base = Math.max(rect.w / iw, rect.h / ih);
  const scale = base * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const slackX = Math.max(0, (dw - rect.w) / 2);
  const slackY = Math.max(0, (dh - rect.h) / 2);
  const offX = Math.max(-slackX, Math.min(slackX, ox * rect.w));
  const offY = Math.max(-slackY, Math.min(slackY, oy * rect.h));
  ctx.drawImage(img, rect.x + (rect.w - dw) / 2 + offX, rect.y + (rect.h - dh) / 2 + offY, dw, dh);
}

/** One grain tile, built once: random grey specks on a 140px square. */
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  grainTile = document.createElement('canvas');
  grainTile.width = 140;
  grainTile.height = 140;
  const g = grainTile.getContext('2d');
  const data = g.createImageData(140, 140);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = 96 + Math.floor(Math.random() * 64);
    data.data[i] = v;
    data.data[i + 1] = v;
    data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  return grainTile;
}

export function renderCover(ctx, W, H, design, photos, selected = -1) {
  const grade = findGrade(design.grade);
  const bandH = titleBandHeight(H);
  const isFull = design.layout === 'full';

  // (1) Backdrop: a radial violet wash, lighter in the middle.
  const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  bg.addColorStop(0, '#2a1145');
  bg.addColorStop(1, '#12081f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // (2) Panels.
  const rects = panelRects(design.layout, W, H, isFull ? 0 : bandH);
  rects.forEach((rect, i) => {
    const panel = design.panels[i] ?? { photo: -1, zoom: 1, ox: 0, oy: 0 };
    const photo = panel.photo >= 0 ? photos[panel.photo] : null;
    ctx.save();
    if (rect.rot) {
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate((rect.rot * Math.PI) / 180);
      ctx.translate(-rect.w / 2, -rect.h / 2);
      rect = { ...rect, x: 0, y: 0 };
    }
    if (rect.frame) {
      // A polaroid: a soft shadow, a white border, and a deeper bottom strip.
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = Math.max(8, W * 0.02);
      ctx.shadowOffsetY = Math.max(4, W * 0.008);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    const border = rect.frame ? rect.w * 0.035 : 0;
    const strip = rect.frame ? rect.h * 0.13 : 0;
    const inner = {
      x: rect.x + border,
      y: rect.y + border,
      w: rect.w - border * 2,
      h: rect.h - border - strip,
    };
    if (photo) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(inner.x, inner.y, inner.w, inner.h);
      ctx.clip();
      drawCoverFit(ctx, gradedPhoto(photo, panel.photo, grade), inner, panel.zoom, panel.ox, panel.oy);
      ctx.restore();
    } else if (!rect.backdrop) {
      // An empty slot says what it is waiting for.
      const g2 = ctx.createLinearGradient(inner.x, inner.y, inner.x, inner.y + inner.h);
      g2.addColorStop(0, '#2c1745');
      g2.addColorStop(1, '#180a28');
      ctx.fillStyle = g2;
      ctx.fillRect(inner.x, inner.y, inner.w, inner.h);
      ctx.save();
      ctx.setLineDash([Math.max(4, W * 0.008), Math.max(4, W * 0.008)]);
      ctx.strokeStyle = 'rgba(143,127,176,0.8)';
      ctx.lineWidth = Math.max(1.5, W * 0.002);
      ctx.strokeRect(inner.x + 4, inner.y + 4, inner.w - 8, inner.h - 8);
      ctx.restore();
      ctx.fillStyle = '#8f7fb0';
      ctx.font = `${Math.max(12, Math.round(Math.min(inner.w, inner.h) * 0.09))}px Anton, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('+ ADD PHOTO', inner.x + inner.w / 2, inner.y + inner.h / 2);
    } else if (photo === null) {
      // A backdrop slot with no photo stays transparent: the violet
      // backdrop underneath already fills the cover.
    }
    if (selected === i) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = Math.max(3, W * 0.006);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();
  });

  // (3) Lettering. Full-bleed covers skip the band and darken the bottom
  // with a scrim instead, so the type stays readable over the photo.
  const bandTop = H - bandH;
  if (isFull) {
    const scrim = ctx.createLinearGradient(0, H * 0.55, 0, H);
    scrim.addColorStop(0, 'rgba(18,6,34,0)');
    scrim.addColorStop(1, 'rgba(18,6,34,0.88)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, H * 0.55, W, H * 0.45);
  } else {
    const band = ctx.createLinearGradient(0, bandTop, 0, H);
    band.addColorStop(0, '#22103c');
    band.addColorStop(1, '#12081f');
    ctx.fillStyle = band;
    ctx.fillRect(0, bandTop, W, bandH);
    if (design.halftone) {
      // Pink halftone dots across the band, fading out to the right.
      const step = Math.max(10, Math.round(H * 0.022));
      for (let x = step / 2; x < W; x += step) {
        const fade = 1 - x / W;
        for (let y = bandTop + step / 2; y < H; y += step) {
          ctx.fillStyle = `rgba(255,90,180,${(0.3 * fade).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1.5, step * 0.14), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Subtitle in gold script, a quarter of the way down the band.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const subSize = Math.max(14, Math.round(bandH * 0.24));
  ctx.font = `${subSize}px Pacifico, cursive`;
  ctx.fillStyle = '#ffd166';
  ctx.fillText(design.subtitle || '', W / 2, bandTop + bandH * 0.26 + subSize * 0.35);

  // Title in big Anton, shrunk until it fits 92% of the cover width,
  // with a cyan print shadow to the left and a pink one to the right.
  let titleSize = Math.round(bandH * 0.56);
  const setTitleFont = () => {
    ctx.font = `${titleSize}px Anton, sans-serif`;
  };
  setTitleFont();
  const maxTitleW = W * 0.92;
  while (titleSize > 16 && ctx.measureText(design.title || '').width > maxTitleW) {
    titleSize -= 2;
    setTitleFont();
  }
  const titleY = bandTop + bandH * 0.9;
  const shadowOff = titleSize * 0.035;
  ctx.fillStyle = '#22d3ee';
  ctx.fillText(design.title || '', W / 2 - shadowOff, titleY);
  ctx.fillStyle = '#ff2e88';
  ctx.fillText(design.title || '', W / 2 + shadowOff, titleY);
  ctx.lineWidth = Math.max(1, titleSize * 0.07);
  ctx.strokeStyle = '#12081f';
  ctx.strokeText(design.title || '', W / 2, titleY);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(design.title || '', W / 2, titleY);

  // (4) The badge ribbon, diagonal across the top-right corner.
  const m = Math.min(W, H);
  const ribbonH = H * 0.045;
  const c = m * 0.15;
  const ribbonLen = 2 * c * Math.SQRT2 + ribbonH * 2;
  ctx.save();
  ctx.translate(W - c, c);
  ctx.rotate(Math.PI / 4);
  const ribbon = ctx.createLinearGradient(-ribbonLen / 2, 0, ribbonLen / 2, 0);
  ribbon.addColorStop(0, '#ff2e88');
  ribbon.addColorStop(1, '#ff7a18');
  ctx.fillStyle = ribbon;
  ctx.fillRect(-ribbonLen / 2, -ribbonH / 2, ribbonLen, ribbonH);
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.round(ribbonH * 0.55)}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`★ ${design.badge || ''} ★`, 0, ribbonH * 0.04);
  ctx.restore();

  // (5) Grain: a tiled speckle, composited as an overlay at low alpha.
  if (design.grain) {
    const tile = getGrainTile();
    const pattern = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.1;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // (6) Vignette: darkened corners so the cover reads as one poster.
  if (design.vignette) {
    const vig = ctx.createRadialGradient(
      W / 2, H / 2, Math.min(W, H) * 0.35,
      W / 2, H / 2, Math.max(W, H) * 0.75,
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }
}
