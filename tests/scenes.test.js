import { describe, it, expect } from 'vitest';
import { SCENES } from '../src/scenes.js';
import { normalize } from '../src/settings.js';

describe('scenes', () => {
  it('has unique names', () => {
    const names = SCENES.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('every scene normalizes to valid settings', () => {
    for (const scene of SCENES) {
      const s = normalize(scene);
      expect(s.visualizer).toBeGreaterThanOrEqual(0);
      expect(s.visualizer).toBeLessThan(10);
      expect(s.theme).toBeGreaterThanOrEqual(0);
      expect(s.theme).toBeLessThan(6);
      expect(s.intensity).toBeGreaterThanOrEqual(0);
      expect(s.intensity).toBeLessThanOrEqual(100);
      expect(s.smoothing).toBeGreaterThanOrEqual(0);
      expect(s.smoothing).toBeLessThanOrEqual(100);
      expect(s.hue).toBeGreaterThanOrEqual(0);
      expect(s.hue).toBeLessThanOrEqual(360);
      expect(typeof s.mirror).toBe('boolean');
      expect(typeof s.flash).toBe('boolean');
      expect(typeof s.hueCycle).toBe('boolean');
    }
  });
});
