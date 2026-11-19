// Neon Coast export: renders the current design at a real post size and
// saves it as a PNG. The three sizes are the common post sizes — square,
// portrait and wide — and the "export all" action writes all three in one go.

import { renderCover } from './cover.js';

export const EXPORT_SIZES = [
  { w: 1080, h: 1080, label: 'Square 1080 × 1080' },
  { w: 1080, h: 1350, label: 'Portrait 1080 × 1350' },
  { w: 1920, h: 1080, label: 'Wide 1920 × 1080' },
];

/** Renders the design onto a fresh canvas at W x H and returns the canvas. */
export function renderCoverCanvas(design, photos, w, h, selected = -1) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  renderCover(canvas.getContext('2d'), w, h, design, photos, selected);
  return canvas;
}

/** The file name for an exported cover at a given size. */
export function exportFileName(w, h) {
  return `neon-coast-${w}x${h}.png`;
}

/** Renders one size and starts its download; resolves once started. */
export function downloadCover(design, photos, w, h) {
  return new Promise((resolve) => {
    const canvas = renderCoverCanvas(design, photos, w, h);
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(w, h);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve(true);
    }, 'image/png');
  });
}

/**
 * Downloads every export size in one step, one after another so the browser
 * keeps each download. Resolves with the file names that were saved.
 */
export async function downloadAllSizes(design, photos, onEach) {
  const saved = [];
  for (const size of EXPORT_SIZES) {
    const ok = await downloadCover(design, photos, size.w, size.h);
    if (ok) {
      saved.push(exportFileName(size.w, size.h));
      if (onEach) onEach(exportFileName(size.w, size.h));
    }
    // A breath between downloads so the browser does not merge them.
    await new Promise((r) => setTimeout(r, 350));
  }
  return saved;
}
