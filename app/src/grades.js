// Colour grades for Neon Coast Cover Studio.
// A grade is five stops [position 0..1, R, G, B]; a pixel's luminance picks
// its colour from the gradient the stops describe.

export const GRADES = [
  {
    id: 'vice', name: 'Vice Sunset',
    stops: [[0.00, 26, 8, 54], [0.22, 96, 22, 96], [0.48, 198, 42, 112], [0.72, 255, 112, 62], [1.00, 255, 216, 142]],
  },
  {
    id: 'neon', name: 'Neon Night',
    stops: [[0, 6, 8, 40], [0.25, 48, 24, 110], [0.5, 148, 32, 168], [0.75, 255, 64, 160], [1, 120, 235, 255]],
  },
  {
    id: 'gold', name: 'Palm Gold',
    stops: [[0, 30, 18, 8], [0.25, 96, 52, 16], [0.5, 188, 110, 30], [0.75, 246, 178, 62], [1, 255, 240, 196]],
  },
  {
    id: 'miami', name: 'Miami Pink',
    stops: [[0, 44, 10, 52], [0.25, 120, 26, 96], [0.5, 224, 62, 140], [0.75, 255, 128, 116], [1, 255, 244, 230]],
  },
  {
    id: 'teal', name: 'Turbo Teal',
    stops: [[0, 4, 26, 34], [0.25, 12, 84, 96], [0.5, 16, 158, 152], [0.75, 92, 216, 178], [1, 226, 255, 224]],
  },
  {
    id: 'dusk', name: 'Chrome Dusk',
    stops: [[0, 16, 16, 28], [0.25, 58, 58, 96], [0.5, 118, 96, 150], [0.75, 196, 150, 190], [1, 240, 236, 244]],
  },
];

export function findGrade(id) {
  return GRADES.find((grade) => grade.id === id) ?? GRADES[0];
}

// Build a 256-entry lookup table per channel: for each brightness level
// 0..255, linearly interpolate between the two stops that bracket it.
export function buildLut(grade) {
  const lut = { r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256) };
  const stops = grade.stops;
  for (let level = 0; level < 256; level++) {
    const t = level / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    const span = b[0] - a[0];
    const f = span === 0 ? 0 : (t - a[0]) / span;
    lut.r[level] = Math.round(a[1] + (b[1] - a[1]) * f);
    lut.g[level] = Math.round(a[2] + (b[2] - a[2]) * f);
    lut.b[level] = Math.round(a[3] + (b[3] - a[3]) * f);
  }
  return lut;
}

// Recolour ImageData in place. A pixel's luminance picks its graded
// colour from the table, then 8% of the original colour is mixed back in
// so the result is a grade, not a pure duotone.
export function applyLut(imageData, lut) {
  const data = imageData.data;
  const keep = 0.08;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.max(0, Math.min(255, Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)));
    data[i] = Math.round(lut.r[lum] * (1 - keep) + r * keep);
    data[i + 1] = Math.round(lut.g[lum] * (1 - keep) + g * keep);
    data[i + 2] = Math.round(lut.b[lum] * (1 - keep) + b * keep);
  }
  return imageData;
}
