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

/**
 * Convert HSL (h in degrees, s/l in 0..100) to a linear [r, g, b] array in
 * 0..1 — used to build dye colors for the GPU fluid sim.
 */
export function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const light = Math.min(100, Math.max(0, l)) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

/**
 * Parse a '#rrggbb' hex color into a linear [r, g, b] array in 0..1, for
 * passing theme backgrounds into GPU shaders.
 */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
