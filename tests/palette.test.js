import { describe, it, expect } from 'vitest';
import { themeColors, hs } from '../src/palette.js';

describe('themeColors', () => {
  it('applies a hue shift and wraps around 360', () => {
    const theme = { hues: [350, 10], sat: 100, light: 50 };
    const colors = themeColors(theme, 20);
    expect(colors[0].h).toBe(10);
    expect(colors[1].h).toBe(30);
  });

  it('preserves saturation and lightness', () => {
    const theme = { hues: [200], sat: 50, light: 60 };
    const [c] = themeColors(theme, 0);
    expect(c.s).toBe(50);
    expect(c.l).toBe(60);
  });
});

describe('hs', () => {
  it('renders an hsla() string with alpha', () => {
    const theme = { hues: [200], sat: 50, light: 60 };
    const [c] = themeColors(theme, 0);
    expect(hs(c, 0.5)).toBe('hsla(200, 50%, 60%, 0.5)');
  });
});
