// Neon Coast grades: each grade is a gradient map that re-lights a photo by
// its brightness, the way a printed poster re-inks a photograph. A grade is a
// list of stops; each stop is [position 0..1, [red, green, blue]]. Shadows sit
// at 0, highlights at 1. The renderer builds a 256-entry lookup table from the
// stops and maps every pixel's luminance through it, so the whole photo takes
// on the grade's sunset or neon palette while keeping its own shapes.

export const GRADES = [
  {
    id: 'vice',
    name: 'Vice Sunset',
    stops: [
      [0.0, [26, 8, 54]],
      [0.22, [96, 22, 96]],
      [0.48, [198, 42, 112]],
      [0.72, [255, 112, 62]],
      [1.0, [255, 216, 142]],
    ],
  },
  {
    id: 'neon',
    name: 'Neon Night',
    stops: [
      [0.0, [6, 8, 40]],
      [0.25, [48, 24, 110]],
      [0.5, [148, 32, 168]],
      [0.75, [255, 64, 160]],
      [1.0, [120, 235, 255]],
    ],
  },
  {
    id: 'gold',
    name: 'Palm Gold',
    stops: [
      [0.0, [30, 18, 8]],
      [0.25, [96, 52, 16]],
      [0.5, [188, 110, 30]],
      [0.75, [246, 178, 62]],
      [1.0, [255, 240, 196]],
    ],
  },
  {
    id: 'miami',
    name: 'Miami Pink',
    stops: [
      [0.0, [44, 10, 52]],
      [0.25, [120, 26, 96]],
      [0.5, [224, 62, 140]],
      [0.75, [255, 128, 116]],
      [1.0, [255, 244, 230]],
    ],
  },
  {
    id: 'teal',
    name: 'Turbo Teal',
    stops: [
      [0.0, [4, 26, 34]],
      [0.25, [12, 84, 96]],
      [0.5, [16, 158, 152]],
      [0.75, [92, 216, 178]],
      [1.0, [226, 255, 224]],
    ],
  },
  {
    id: 'dusk',
    name: 'Chrome Dusk',
    stops: [
      [0.0, [16, 16, 28]],
      [0.25, [58, 58, 96]],
      [0.5, [118, 96, 150]],
      [0.75, [196, 150, 190]],
      [1.0, [240, 236, 244]],
    ],
  },
];

/** Looks a grade up by id, falling back to the first grade. */
export function gradeById(id) {
  return GRADES.find((g) => g.id === id) ?? GRADES[0];
}

/**
 * Builds the 256-entry per-channel lookup table for a grade. The table is
 * what the renderer actually applies: for each brightness level 0..255 it
 * holds the graded colour, linearly interpolated between the grade's stops.
 */
export function buildLut(grade) {
  const stops = grade.stops;
  const table = {
    r: new Uint8Array(256),
    g: new Uint8Array(256),
    b: new Uint8Array(256),
  };
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let lower = stops[0];
    let upper = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s += 1) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        lower = stops[s];
        upper = stops[s + 1];
        break;
      }
    }
    const span = Math.max(0.000001, upper[0] - lower[0]);
    const f = Math.min(1, Math.max(0, (t - lower[0]) / span));
    table.r[i] = Math.round(lower[1][0] + (upper[1][0] - lower[1][0]) * f);
    table.g[i] = Math.round(lower[1][1] + (upper[1][1] - lower[1][1]) * f);
    table.b[i] = Math.round(lower[1][2] + (upper[1][2] - lower[1][2]) * f);
  }
  return table;
}

/**
 * Re-inks an ImageData in place through a lookup table. Luminance picks the
 * graded colour; a little of the original colour is kept so skin and sky do
 * not flatten into a pure duotone.
 */
export function applyLut(imageData, lut, keep = 0.08) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(
      0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2],
    );
    data[i] = Math.round(lut.r[lum] * (1 - keep) + data[i] * keep);
    data[i + 1] = Math.round(lut.g[lum] * (1 - keep) + data[i + 1] * keep);
    data[i + 2] = Math.round(lut.b[lum] * (1 - keep) + data[i + 2] * keep);
  }
  return imageData;
}
