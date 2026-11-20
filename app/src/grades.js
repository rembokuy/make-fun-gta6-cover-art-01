// Colour grades. A grade is a list of stops [position 0..1, R, G, B] that
// map a pixel's brightness to a colour, like a sunset gradient LUT.

export const GRADES = [
  {
    id: "vice",
    name: "Vice Sunset",
    stops: [
      [0.0, 26, 8, 54],
      [0.22, 96, 22, 96],
      [0.48, 198, 42, 112],
      [0.72, 255, 112, 62],
      [1.0, 255, 216, 142],
    ],
  },
  {
    id: "neon",
    name: "Neon Night",
    stops: [
      [0, 6, 8, 40],
      [0.25, 48, 24, 110],
      [0.5, 148, 32, 168],
      [0.75, 255, 64, 160],
      [1, 120, 235, 255],
    ],
  },
  {
    id: "gold",
    name: "Palm Gold",
    stops: [
      [0, 30, 18, 8],
      [0.25, 96, 52, 16],
      [0.5, 188, 110, 30],
      [0.75, 246, 178, 62],
      [1, 255, 240, 196],
    ],
  },
  {
    id: "miami",
    name: "Miami Pink",
    stops: [
      [0, 44, 10, 52],
      [0.25, 120, 26, 96],
      [0.5, 224, 62, 140],
      [0.75, 255, 128, 116],
      [1, 255, 244, 230],
    ],
  },
  {
    id: "teal",
    name: "Turbo Teal",
    stops: [
      [0, 4, 26, 34],
      [0.25, 12, 84, 96],
      [0.5, 16, 158, 152],
      [0.75, 92, 216, 178],
      [1, 226, 255, 224],
    ],
  },
  {
    id: "dusk",
    name: "Chrome Dusk",
    stops: [
      [0, 16, 16, 28],
      [0.25, 58, 58, 96],
      [0.5, 118, 96, 150],
      [0.75, 196, 150, 190],
      [1, 240, 236, 244],
    ],
  },
];

export function findGrade(id) {
  return GRADES.find((g) => g.id === id) || GRADES[0];
}

// Build a 256-entry lookup table per channel by linearly interpolating
// between the stops that bracket each brightness level.
export function buildLut(grade) {
  const lut = { r: new Uint8Array(256), g: new Uint8Array(256), b: new Uint8Array(256) };
  const stops = grade.stops;
  for (let level = 0; level < 256; level++) {
    const t = level / 255;
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const a = stops[i];
    const b = stops[i + 1];
    const span = b[0] - a[0] || 1;
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    lut.r[level] = Math.round(a[1] + (b[1] - a[1]) * f);
    lut.g[level] = Math.round(a[2] + (b[2] - a[2]) * f);
    lut.b[level] = Math.round(a[3] + (b[3] - a[3]) * f);
  }
  return lut;
}

// Recolour an ImageData in place: the pixel's luminance picks the grade
// colour from the LUT, then 8% of the original colour is mixed back in so
// the result is a grade, not a pure duotone.
export function applyLut(imageData, lut) {
  const data = imageData.data;
  const keep = 0.08;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(
      0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    );
    data[i] = Math.round(lut.r[lum] * (1 - keep) + data[i] * keep);
    data[i + 1] = Math.round(lut.g[lum] * (1 - keep) + data[i + 1] * keep);
    data[i + 2] = Math.round(lut.b[lum] * (1 - keep) + data[i + 2] * keep);
  }
  return imageData;
}
