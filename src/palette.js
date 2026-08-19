// Themes are stored as HSL "hue offsets" so a global hue shift is a trivial
// addition that wraps around 360°, and every visualizer can derive any color
// at any alpha from the theme.
export const THEMES = [
  { id: 'neon', name: 'Neon', hues: [185, 330, 265, 155], sat: 100, light: 62, background: '#05060f' },
  { id: 'sunset', name: 'Sunset', hues: [0, 22, 45, 330], sat: 95, light: 60, background: '#120a12' },
  { id: 'ocean', name: 'Ocean', hues: [190, 225, 245, 165], sat: 90, light: 60, background: '#020617' },
  { id: 'ember', name: 'Ember', hues: [14, 32, 48, 4], sat: 100, light: 55, background: '#0c0402' },
  { id: 'mono', name: 'Mono', hues: [220, 215, 210, 230], sat: 8, light: 75, background: '#0a0d14' },
  { id: 'aurora', name: 'Aurora', hues: [160, 190, 258, 320], sat: 85, light: 62, background: '#03120d' },
];

/**
 * Resolve a theme's colors as { h, s, l } objects with a hue shift applied.
 * @returns {{ h: number, s: number, l: number }[]}
 */
export function themeColors(theme, hueShift = 0) {
  return theme.hues.map((h) => ({
    h: (h + hueShift) % 360,
    s: theme.sat,
    l: theme.light,
  }));
}

/**
 * Render a color object (from themeColors) as an hsla() canvas string.
 */
export function hs(c, alpha = 1) {
  return `hsla(${c.h}, ${c.s}%, ${c.l}%, ${alpha})`;
}
