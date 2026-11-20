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

export function downloadCover(canvas, w, h) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const name = exportFileName(w, h);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      resolve(name);
    }, "image/png");
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function downloadAllSizes(design, photos, onFile) {
  const saved = [];
  for (const size of EXPORT_SIZES) {
    const canvas = renderCoverCanvas(design, photos, size.w, size.h);
    const name = await downloadCover(canvas, size.w, size.h);
    if (name) {
      saved.push(name);
      if (onFile) onFile(name);
    }
    await sleep(350);
  }
  return saved;
}
