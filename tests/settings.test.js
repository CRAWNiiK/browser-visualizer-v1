import { describe, it, expect } from 'vitest';
import { DEFAULTS, encode, decode, normalize } from '../src/settings.js';

describe('settings encode/decode', () => {
  it('round-trips defaults', () => {
    expect(decode(encode(DEFAULTS))).toEqual(DEFAULTS);
  });

  it('round-trips a custom state', () => {
    const state = {
      visualizer: 3,
      intensity: 80,
      smoothing: 20,
      hue: 180,
      hueCycle: true,
      theme: 2,
      mirror: true,
      flash: false,
    };
    expect(decode(encode(state))).toEqual(state);
  });

  it('clamps out-of-range values', () => {
    const decoded = decode('v=99&i=-5&s=150&h=999&t=-1&c=1&m=1&f=1');
    expect(decoded.visualizer).toBe(9);
    expect(decoded.intensity).toBe(0);
    expect(decoded.smoothing).toBe(100);
    expect(decoded.hue).toBe(360);
    expect(decoded.theme).toBe(0);
    expect(decoded.hueCycle).toBe(true);
    expect(decoded.mirror).toBe(true);
    expect(decoded.flash).toBe(true);
  });

  it('fills missing keys with defaults', () => {
    expect(decode('v=2')).toEqual({ ...DEFAULTS, visualizer: 2 });
  });

  it('ignores unknown params', () => {
    const decoded = decode('v=1&garbage=42');
    expect(decoded.visualizer).toBe(1);
    expect(decoded.garbage).toBeUndefined();
  });

  it('falls back to defaults for non-numeric values', () => {
    const decoded = decode('i=abc&t=xyz&v=seven');
    expect(decoded.intensity).toBe(DEFAULTS.intensity);
    expect(decoded.theme).toBe(DEFAULTS.theme);
    expect(decoded.visualizer).toBe(DEFAULTS.visualizer);
  });
});

describe('normalize', () => {
  it('fills missing keys with defaults and clamps values', () => {
    expect(normalize({ visualizer: 99, intensity: -5 })).toEqual({
      ...DEFAULTS,
      visualizer: 9,
      intensity: 0,
    });
  });

  it('drops unknown keys', () => {
    const s = normalize({ visualizer: 2, name: 'x', description: 'y' });
    expect(s.visualizer).toBe(2);
    expect(s.name).toBeUndefined();
    expect(s.description).toBeUndefined();
  });
});
