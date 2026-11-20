// The three cover layouts. Each one answers the same questions for
// any canvas size: where do the photos go, where does the title sit,
// where does the tagline sit, and how thick is the frame.
// Geometry is fractions of the canvas, so one layout works for a
// square post, a portrait post and a wide banner alike.

export const LAYOUTS = [
  {
    id: 'sunset-stack',
    label: 'Sunset Stack',
    hint: 'One big photo on top, title band below',
    panels(w, h) {
      return [{ photo: 0, x: 0, y: 0, w, h: Math.round(h * 0.64) }];
    },
    titleZone(w, h) {
      return { x: w / 2, y: Math.round(h * 0.74), align: 'center', size: Math.round(w * 0.115) };
    },
    taglineZone(w, h) {
      return { x: w / 2, y: Math.round(h * 0.88), align: 'center', size: Math.round(w * 0.038) };
    },
    frame(w, h) {
      return { inset: Math.round(Math.min(w, h) * 0.022), width: Math.max(3, Math.round(w * 0.004)) };
    },
  },
  {
    id: 'split-vice',
    label: 'Split Vice',
    hint: 'Two photos side by side, title across the seam',
    panels(w, h) {
      return [
        { photo: 0, x: 0, y: 0, w: Math.round(w * 0.56), h },
        { photo: 1, x: Math.round(w * 0.56), y: 0, w: w - Math.round(w * 0.56), h },
      ];
    },
    titleZone(w, h) {
      return { x: w / 2, y: Math.round(h * 0.47), align: 'center', size: Math.round(w * 0.105) };
    },
    taglineZone(w, h) {
      return { x: Math.round(w * 0.05), y: Math.round(h * 0.93), align: 'left', size: Math.round(w * 0.034) };
    },
    frame(w, h) {
      return { inset: Math.round(Math.min(w, h) * 0.03), width: Math.max(3, Math.round(w * 0.005)) };
    },
  },
  {
    id: 'neon-frame',
    label: 'Neon Frame',
    hint: 'Full-bleed photo, title top, tagline bottom',
    panels(w, h) {
      return [{ photo: 0, x: 0, y: 0, w, h }];
    },
    titleZone(w, h) {
      return { x: Math.round(w * 0.06), y: Math.round(h * 0.16), align: 'left', size: Math.round(w * 0.12) };
    },
    taglineZone(w, h) {
      return { x: w - Math.round(w * 0.06), y: Math.round(h * 0.9), align: 'right', size: Math.round(w * 0.036) };
    },
    frame(w, h) {
      return { inset: Math.round(Math.min(w, h) * 0.045), width: Math.max(4, Math.round(w * 0.007)) };
    },
  },
];

export function findLayout(id) {
  return LAYOUTS.find((entry) => entry.id === id) || LAYOUTS[0];
}
