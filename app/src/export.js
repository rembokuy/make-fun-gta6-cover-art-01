// Export: render the cover at a post size and hand it to the user
// as a PNG download. Export-all writes the three sizes one by one.

import { drawCover } from './render.js';

export const EXPORT_SIZES = [
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Portrait', width: 1080, height: 1350 },
  { label: 'Wide', width: 1920, height: 1080 },
];

function renderOffscreen(state, images, width, height) {
  const canvas = document.createElement('canvas');
  return drawCover(canvas, state, images, width, height);
}

export function exportDataURL(state, images, width, height, mime, quality) {
  const canvas = renderOffscreen(state, images, width, height);
  return canvas.toDataURL(mime || 'image/png', quality);
}

export function downloadPNG(state, images, width, height) {
  return new Promise((resolve, reject) => {
    const canvas = renderOffscreen(state, images, width, height);
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('export produced no PNG')); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'neon-coast-' + width + 'x' + height + '.png';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      resolve({ width, height, bytes: blob.size, name: link.download });
    }, 'image/png');
  });
}

export async function exportAllSizes(state, images, onEach) {
  const done = [];
  for (const size of EXPORT_SIZES) {
    const result = await downloadPNG(state, images, size.width, size.height);
    done.push(result);
    if (typeof onEach === 'function') onEach(result);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return done;
}
