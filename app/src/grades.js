export const GRADES = [
  {
    id: "vice",
    name: "Vice Sunset",
    stops: [
      [0, 26, 8, 54],
      [0.22, 96, 22, 96],
      [0.48, 198, 42, 112],
      [0.72, 255, 112, 62],
      [1, 255, 216, 142],
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
  return GRADES.find((grade) => grade.id === id) || GRADES[0];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function buildLut(grade) {
  const stops = grade.stops;
  const r = new Uint8Array(256);
  const g = new Uint8Array(256);
  const b = new Uint8Array(256);
  for (let level = 0; level < 256; level++) {
    const t = level / 255;
    let lower = stops[0];
    let upper = stops[stops.length - 1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) {
        lower = stops[i];
        upper = stops[i + 1];
        break;
      }
    }
    const span = upper[0] - lower[0];
    const f = span === 0 ? 0 : (t - lower[0]) / span;
    r[level] = Math.round(lerp(lower[1], upper[1], f));
    g[level] = Math.round(lerp(lower[2], upper[2], f));
    b[level] = Math.round(lerp(lower[3], upper[3], f));
  }
  return { r, g, b };
}

export function applyLut(imageData, lut) {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const lum = Math.round(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    const l = Math.max(0, Math.min(255, lum));
    data[i] = Math.round(lut.r[l] * 0.92 + data[i] * 0.08);
    data[i + 1] = Math.round(lut.g[l] * 0.92 + data[i + 1] * 0.08);
    data[i + 2] = Math.round(lut.b[l] * 0.92 + data[i + 2] * 0.08);
  }
}
