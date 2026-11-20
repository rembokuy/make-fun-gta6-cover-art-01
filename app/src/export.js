// Export: render a design at a chosen size and download it as a PNG.

import { renderCover } from './cover.js';

/** The three export sizes: Square, Portrait and Wide. */
export const EXPORT_SIZES = [
  { id: 'square', name: 'Square', w: 1080, h: 1080 },
  { id: 'portrait', name: 'Portrait', w: 1080, h: 1350 },
  { id: 'wide', name: 'Wide', w: 1920, h: 1080 },
];

/** Render a design onto a fresh canvas of the given size. */
export function renderCoverCanvas(w, h, design, photos) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  renderCover(ctx, w, h, design, photos, -1);
  return canvas;
}

/** The file name for an export of the given size. */
export function exportFileName(w, h) {
  return `neon-coast-${w}x${h}.png`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Download one export: render, turn the canvas into a PNG blob, and click
 * a temporary link. The object URL is released a few seconds later so the
 * download has time to start.
 */
export async function downloadCover(size, design, photos) {
  const canvas = renderCoverCanvas(size.w, size.h, design, photos);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = exportFileName(size.w, size.h);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return link.download;
}

/**
 * Download all three sizes in turn, pausing briefly between them so the
 * browser registers each download. Returns the saved file names, and calls
 * onFile(name) after each one when a callback is given.
 */
export async function downloadAllSizes(design, photos, onFile) {
  const saved = [];
  for (const size of EXPORT_SIZES) {
    const name = await downloadCover(size, design, photos);
    saved.push(name);
    if (onFile) onFile(name);
    await sleep(350);
  }
  return saved;
}
