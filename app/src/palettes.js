// The three colour grades. Each one is a mood, not just a tint:
// a background, the ink the title is set in, two accent colours,
// a glow for the neon lettering, and the two stops of the wash
// laid over the photos.

export const PALETTES = [
  {
    id: 'coral-dusk',
    label: 'Coral Dusk',
    hint: 'Warm sunset over the bay',
    bg: '#2a1024',
    ink: '#fff1de',
    accent: '#ff6b5e',
    accent2: '#ffb37a',
    glow: '#ff4d8d',
    washTop: 'rgba(42,16,36,0)',
    washBottom: 'rgba(42,16,36,0.82)',
    strip: 'rgba(255,107,94,0.92)',
  },
  {
    id: 'boardwalk-neon',
    label: 'Boardwalk Neon',
    hint: 'Cyan and magenta after dark',
    bg: '#06121f',
    ink: '#eafcff',
    accent: '#2ee6ff',
    accent2: '#ff2fb3',
    glow: '#2ee6ff',
    washTop: 'rgba(6,18,31,0)',
    washBottom: 'rgba(6,18,31,0.85)',
    strip: 'rgba(46,230,255,0.9)',
  },
  {
    id: 'vice-gold',
    label: 'Vice Gold',
    hint: 'Gold lettering on a purple night',
    bg: '#160a24',
    ink: '#fff7e0',
    accent: '#ffc94d',
    accent2: '#19c2a6',
    glow: '#ffc94d',
    washTop: 'rgba(22,10,36,0)',
    washBottom: 'rgba(22,10,36,0.84)',
    strip: 'rgba(255,201,77,0.92)',
  },
];

export function findPalette(id) {
  return PALETTES.find((entry) => entry.id === id) || PALETTES[0];
}
