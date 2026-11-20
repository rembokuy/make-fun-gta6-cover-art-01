// The two sample photos shipped with the studio.
// Both are local files, so the app never fetches anything at run time.

export const PHOTOS = [
  { id: 'coral-dusk', label: 'Coral Dusk', src: 'samples/coral-dusk.jpg' },
  { id: 'boardwalk-neon', label: 'Boardwalk Neon', src: 'samples/boardwalk-neon.jpg' },
];

export function loadPhoto(entry) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('could not load ' + entry.src));
    img.src = entry.src;
  });
}

export function loadAllPhotos() {
  return Promise.all(PHOTOS.map(loadPhoto));
}

// Draw img so it covers rect (x, y, w, h) with no empty edges,
// cropping the overflow the way a cover photo should.
export function drawCoverFit(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

// A vertical wash from transparent to solid, for text legibility.
export function shadeBand(ctx, x, y, w, h, from, to) {
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, from);
  grad.addColorStop(1, to);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
}
