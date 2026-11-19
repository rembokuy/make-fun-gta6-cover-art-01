// Neon Coast grades.
//
// A grade is a gradient map: it re-lights a photo by brightness, the way a
// printed poster re-inks a photograph. Each grade is a run of stops; a stop
// is [position, red, green, blue] with position from 0 (shadows) to 1
// (highlights). The renderer turns the stops into a 256-entry lookup table
// and maps every pixel's luminance through it, so a photo keeps its own
// shapes but takes on the grade's sunset or neon palette.

export const GRADES = [
  {
    id: 'vice',
    name: 'Vice Sunset',
    stops: [
      [0.0, 26, 8, 54],
      [0.22, 96, 22, 96],
      [0.48, 198, 42, 112],
      [0.72, 255, 112, 62],
      [1.0, 255, 216, 142],
    ],
  },
  {
    id: 'neon',
    name: 'Neon Night',
    stops: [
      [0.0, 6, 8, 40],
      [0.25, 48, 24, 110],
      [0.5, 148, 32, 168],
      [0.75, 255, 64, 160],
      [1.0, 120, 235, 255],
    ],
  },
  {
    id: 'gold',
    name: 'Palm Gold',
    stops: [
      [0.0, 30, 18, 8],
      [0.25, 96, 52, 16],
      [0.5, 188, 110, 30],
      [0.75, 246, 178, 62],
      [1.0, 255, 240, 196],
    ],
  },
  {
    id: 'miami',
    name: 'Miami Pink',
    stops: [
      [0.0, 44, 10, 52],
      [0.25, 120, 26, 96],
      [0.5, 224, 62, 140],
      [0.75, 255, 128, 116],
      [1.0, 255, 244, 230],
    ],
  },
  {
    id: 'teal',
    name: 'Turbo Teal',
    stops: [
      [0.0, 4, 26, 34],
      [0.25, 12, 84, 96],
      [0.5, 16, 158, 152],
      [0.75, 92, 216, 178],
      [1.0, 226, 255, 224],
    ],
  },
  {
    id: 'dusk',
    name: 'Chrome Dusk',
    stops: [
      [0.0, 16, 16, 28],
      [0.25, 58, 58, 96],
      [0.5, 118, 96, 150],
      [0.75, 196, 150, 190],
      [1.0, 240, 236, 244],
    ],
  },
];

/** Finds a grade by id; unknown ids fall back to the first grade. */
export function gradeById(id) {
  for (const grade of GRADES) {
    if (grade.id === id) return grade;
  }
  return GRADES[0];
}

/**
 * Turns a grade's stops into the table the renderer actually uses: for each
 * brightness level 0..255, the graded colour, linearly interpolated between
 * the two stops that bracket that level.
 */
export function buildLut(grade) {
  const table = {
    r: new Uint8Array(256),
    g: new Uint8Array(256),
    b: new Uint8Array(256),
  };
  const stops = grade.stops;
  for (let level = 0; level < 256; level += 1) {
    const t = level / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s + 1 < stops.length; s += 1) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    const span = Math.max(0.000001, b[0] - a[0]);
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    table.r[level] = Math.round(a[1] + (b[1] - a[1]) * f);
    table.g[level] = Math.round(a[2] + (b[2] - a[2]) * f);
    table.b[level] = Math.round(a[3] + (b[3] - a[3]) * f);
  }
  return table;
}

/**
 * Re-inks an ImageData in place through a lookup table. The pixel's
 * luminance picks the graded colour; `keep` (a fraction) of the original
 * colour is mixed back in so skin and sky do not flatten into pure duotone.
 */
export function applyLut(imageData, lut, keep = 0.08) {
  const px = imageData.data;
  const mix = 1 - keep;
  for (let i = 0; i < px.length; i += 4) {
    const lum = Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]);
    px[i] = Math.round(lut.r[lum] * mix + px[i] * keep);
    px[i + 1] = Math.round(lut.g[lum] * mix + px[i + 1] * keep);
    px[i + 2] = Math.round(lut.b[lum] * mix + px[i + 2] * keep);
  }
  return imageData;
}
