// PNG export: render the design at each size and trigger downloads.

import { renderCover } from "./cover.js";

export const EXPORT_SIZES = [
  { id: "square", label: "Square", w: 1080, h: 1080 },
  { id: "portrait", label: "Portrait", w: 1080, h: 1350 },
  { id: "wide", label: "Wide", w: 1920, h: 1080 },
];

export function renderCoverCanvas(design, photos, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  renderCover(ctx, w, h, design, photos, -1);
  return canvas;
}

export function exportFileName(w, h) {
  return `neon-coast-${w}x${h}.png`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function downloadCover(design, photos, size) {
  return new Promise((resolve) => {
    const canvas = renderCoverCanvas(design, photos, size.w, size.h);
    canvas.toBlob((blob) => {
      if (!blob) return resolve(null);
      downloadBlob(blob, exportFileName(size.w, size.h));
      resolve(exportFileName(size.w, size.h));
    }, "image/png");
  });
}

export async function downloadAllSizes(design, photos, onFile) {
  const saved = [];
  for (const size of EXPORT_SIZES) {
    const name = await downloadCover(design, photos, size);
    if (name) {
      saved.push(name);
      if (onFile) onFile(name);
    }
    await new Promise((r) => setTimeout(r, 350));
  }
  return saved;
}
