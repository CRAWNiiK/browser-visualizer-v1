import { describe, it, expect } from 'vitest';
import { spectrumToBins, bandLevel, BeatDetector } from '../src/audio-utils.js';

describe('spectrumToBins', () => {
  it('returns the requested number of bins', () => {
    const data = new Uint8Array(1024);
    expect(spectrumToBins(data, 64, 48000, 2048).length).toBe(64);
  });

  it('returns all zeros for silence', () => {
    const data = new Uint8Array(1024).fill(0);
    const bins = spectrumToBins(data, 64, 48000, 2048);
    expect(Array.from(bins).every((b) => b === 0)).toBe(true);
  });

  it('returns ~1 for full-scale signal', () => {
    const data = new Uint8Array(1024).fill(255);
    const bins = spectrumToBins(data, 64, 48000, 2048);
    for (const b of bins) {
      expect(b).toBeGreaterThan(0.9);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('normalizes a mid-scale signal to ~0.5', () => {
    const data = new Uint8Array(1024).fill(128);
    const bins = spectrumToBins(data, 64, 48000, 2048);
    for (const b of bins) {
      expect(b).toBeGreaterThan(0.45);
      expect(b).toBeLessThan(0.56);
    }
  });

  it('maps low frequencies to lower bins than high frequencies', () => {
    const low = new Uint8Array(1024).fill(0);
    low[3] = 255; // ~70 Hz
    const high = new Uint8Array(1024).fill(0);
    high[800] = 255; // ~18.7 kHz
    const lowBins = spectrumToBins(low, 64, 48000, 2048);
    const highBins = spectrumToBins(high, 64, 48000, 2048);

    const lastNonZero = (bins) => {
      for (let i = bins.length - 1; i >= 0; i--) if (bins[i] > 0) return i;
      return -1;
    };

    expect(lowBins.slice(0, 16).some((b) => b > 0)).toBe(true);
    expect(highBins[63]).toBeGreaterThan(0);
    expect(lastNonZero(lowBins)).toBeLessThan(lastNonZero(highBins));
  });
});

describe('bandLevel', () => {
  it('averages a range', () => {
    const bins = new Float32Array([0.5, 1, 0.5, 0]);
    expect(bandLevel(bins, 0, 2)).toBeCloseTo(0.75);
    expect(bandLevel(bins, 2, 4)).toBeCloseTo(0.25);
  });

  it('handles out-of-range and empty windows', () => {
    const bins = new Float32Array([0.5, 1]);
    expect(bandLevel(bins, 0, 99)).toBeCloseTo(0.75);
    expect(bandLevel(bins, 1, 1)).toBe(0);
  });
});

describe('BeatDetector', () => {
  it('fires on an impulse well above the running average', () => {
    const bd = new BeatDetector({ minInterval: 0.1 });
    for (let i = 0; i < 30; i++) bd.update(0.05, 1 / 60); // quiet baseline
    expect(bd.update(0.9, 1 / 60)).toBe(true);
  });

  it('stops firing once a sustained loud signal raises the average', () => {
    const bd = new BeatDetector({ threshold: 1.3, minInterval: 0.1 });
    let beatsInTail = 0;
    for (let i = 0; i < 200; i++) {
      const beat = bd.update(0.8, 1 / 60);
      if (i >= 140 && beat) beatsInTail++;
    }
    expect(beatsInTail).toBe(0);
  });

  it('respects the cooldown interval', () => {
    const bd = new BeatDetector({ minInterval: 0.5 });
    for (let i = 0; i < 30; i++) bd.update(0.05, 1 / 60);
    expect(bd.update(0.9, 1 / 60)).toBe(true);
    expect(bd.update(0.9, 1 / 60)).toBe(false); // still within cooldown
  });
});
