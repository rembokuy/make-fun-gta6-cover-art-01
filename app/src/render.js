// Draws one cover on a canvas of any size, from the studio state,
// the loaded photos, one layout and one palette.

import { findLayout } from './layouts.js';
import { findPalette } from './palettes.js';
import { drawCoverFit, shadeBand } from './photos.js';

function fitFont(ctx, text, size, maxWidth) {
  let px = size;
  ctx.font = px + 'px Monoton, "Bebas Neue", sans-serif';
  while (px > 12 && ctx.measureText(text).width > maxWidth) {
    px -= 2;
    ctx.font = px + 'px Monoton, "Bebas Neue", sans-serif';
  }
  return px;
}

export function drawCover(canvas, state, images, width, height) {
  const w = width;
  const h = height;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const layout = findLayout(state.layout);
  const palette = findPalette(state.palette);

  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, w, h);

  const panels = layout.panels(w, h);
  for (const panel of panels) {
    const img = images[panel.photo === 1 ? 1 - state.photo : state.photo];
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x, panel.y, panel.w, panel.h);
    ctx.clip();
    drawCoverFit(ctx, img, panel.x, panel.y, panel.w, panel.h);
    shadeBand(ctx, panel.x, panel.y, panel.w, panel.h, palette.washTop, palette.washBottom);
    ctx.restore();
  }

  // Seam between the two photos in the split layout.
  if (panels.length > 1) {
    ctx.fillStyle = palette.accent;
    ctx.fillRect(panels[0].x + panels[0].w - Math.max(2, Math.round(w * 0.004)), 0, Math.max(4, Math.round(w * 0.008)), h);
  }

  // Title band for the split layout: a translucent strip to sit on.
  if (state.layout === 'split-vice') {
    const zone = layout.titleZone(w, h);
    const bandH = Math.round(zone.size * 2.1);
    ctx.fillStyle = 'rgba(8,8,18,0.55)';
    ctx.fillRect(0, zone.y - bandH * 0.62, w, bandH);
    ctx.fillStyle = palette.strip;
    ctx.fillRect(0, zone.y - bandH * 0.62, w, Math.max(3, Math.round(h * 0.006)));
    ctx.fillRect(0, zone.y + bandH * 0.38, w, Math.max(3, Math.round(h * 0.006)));
  }

  // Title, in the neon display face, with a soft glow.
  const title = layout.titleZone(w, h);
  const titlePx = fitFont(ctx, state.title, title.size, w * 0.92);
  ctx.save();
  ctx.textAlign = title.align;
  ctx.textBaseline = 'middle';
  ctx.shadowColor = palette.glow;
  ctx.shadowBlur = Math.round(w * 0.02);
  ctx.fillStyle = palette.ink;
  try { ctx.letterSpacing = Math.round(titlePx * 0.04) + 'px'; } catch (e) { /* older canvas: no letter spacing */ }
  ctx.fillText(state.title, title.x, title.y);
  ctx.restore();

  // Thin accent rule under the title in the stacked layout.
  if (state.layout === 'sunset-stack') {
    const ruleW = Math.round(w * 0.3);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(Math.round((w - ruleW) / 2), Math.round(title.y + titlePx * 0.72), ruleW, Math.max(3, Math.round(h * 0.005)));
  }

  // Tagline, in the condensed accent face.
  const tag = layout.taglineZone(w, h);
  ctx.save();
  ctx.textAlign = tag.align;
  ctx.textBaseline = 'middle';
  ctx.font = tag.size + 'px "Bebas Neue", sans-serif';
  try { ctx.letterSpacing = Math.round(tag.size * 0.22) + 'px'; } catch (e) { /* older canvas */ }
  ctx.fillStyle = palette.accent2;
  ctx.fillText(state.tagline.toUpperCase(), tag.x, tag.y);
  ctx.restore();

  // Frame.
  const frame = layout.frame(w, h);
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = frame.width;
  ctx.strokeRect(frame.inset, frame.inset, w - frame.inset * 2, h - frame.inset * 2);
  ctx.strokeStyle = palette.ink;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = Math.max(1, Math.round(frame.width / 3));
  const inner = frame.inset + frame.width + Math.round(Math.min(w, h) * 0.012);
  ctx.strokeRect(inner, inner, w - inner * 2, h - inner * 2);
  ctx.globalAlpha = 1;

  return canvas;
}
