import { describe, it, expect } from 'vitest';
import { systemAudioSupport } from '../src/audio.js';

// Realistic UA strings for the engines that matter.
const UAS = {
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  vivaldi:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Vivaldi/7.0.3495.29',
  edge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86',
  firefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
};

describe('systemAudioSupport', () => {
  it('reports available in Chromium browsers, including Vivaldi and Edge', () => {
    expect(systemAudioSupport(UAS.chrome)).toBe('available');
    expect(systemAudioSupport(UAS.vivaldi)).toBe('available');
    expect(systemAudioSupport(UAS.edge)).toBe('available');
  });

  it('reports unavailable in Firefox, which never ships share audio', () => {
    expect(systemAudioSupport(UAS.firefox)).toBe('unavailable');
  });

  it('lets Safari attempt the share (a video-only stream hits the clearer error)', () => {
    expect(systemAudioSupport(UAS.safari)).toBe('available');
  });

  it('defaults to available for an unknown UA — worst case is the clearer error message', () => {
    expect(systemAudioSupport('')).toBe('available');
    expect(systemAudioSupport()).toBe('available'); // falls back to navigator.userAgent
  });
});
