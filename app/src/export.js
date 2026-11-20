// PNG export for Neon Coast Cover Studio.

import { renderCover } from './cover.js';

export const EXPORT_SIZES = [
  { name: 'Square', w: 1080, h: 1080 },
  { name: 'Portrait', w: 1080, h: 1350 },
  { name: 'Wide', w: 1920, h: 1080 },
];

// Render the design onto a fresh canvas of the requested size.
export function renderCoverCanvas(design, photos, w, h, selected = -1) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  renderCover(ctx, w, h, design, photos, selected);
  return canvas;
}

export function exportFileName(w, h) {
  return `neon-coast-${w}x${h}.png`;
}

function blobToDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('PNG export failed'));
    }, 'image/png');
  });
}

// Render one size and download it as a PNG.
export async function downloadCover(design, photos, w, h) {
  const canvas = renderCoverCanvas(design, photos, w, h);
  const blob = await canvasToBlob(canvas);
  const fileName = exportFileName(w, h);
  blobToDownload(blob, fileName);
  return fileName;
}

const sleep = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));

// Download all three sizes in order, 350 ms apart, and return the saved
// file names; onFile(name) is called after each download, when given.
export async function downloadAllSizes(design, photos, onFile) {
  const saved = [];
  for (const size of EXPORT_SIZES) {
    const name = await downloadCover(design, photos, size.w, size.h);
    saved.push(name);
    if (onFile) onFile(name);
    await sleep(350);
  }
  return saved;
}
