// Shared WebGPU runtime for the GPU visualizers, backed by vgpu (https://vgpu.sh).
// There is one Gpu context and one surface per window (main app or popout);
// visualizers create their effects against it. Everything degrades gracefully:
// if WebGPU is unavailable or fails to initialize, ensureGpu() resolves null
// and the engine falls back to the 2D canvas.

import { frame, init, surface } from 'vgpu';
import { hexToRgb } from './palette.js';

let gpu = null; // the shared Gpu context, or 'failed' after a failed attempt
let surfaceRef = null;
let targetCanvas = null;
let pending = null;

/**
 * Build the shared `Params` uniform object (shaders/audio-params.wgsl) from
 * engine state. Every WebGPU visualizer feeds its shaders through this, so
 * the audio/theme fields stay consistent everywhere.
 */
export function paramsFromState(s, size, sinceBeat) {
  const base = s.colors[0] || { h: 0, s: 100, l: 62 };
  return {
    time: s.t,
    dt: s.dt,
    bass: s.bass,
    mid: s.mid,
    treble: s.treble,
    level: s.level,
    beatEnergy: s.beatEnergy,
    beatTime: sinceBeat,
    intensity: s.intensity,
    hue: base.h,
    sat: (base.s ?? 100) / 100,
    light: (base.l ?? 62) / 100,
    mirror: s.mirror ? 1 : 0,
    resolution: [size[0], size[1]],
    background: hexToRgb(s.theme.background),
  };
}

/** Feature-detect WebGPU. Safe to call anywhere. */
export function hasWebGPU() {
  return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/** The engine registers the canvas GPU visualizers render into. */
export function setGpuCanvas(canvas) {
  if (canvas !== targetCanvas) {
    // A different canvas (main window vs popout) invalidates the surface.
    targetCanvas = canvas;
    surfaceRef = null;
  }
}

/**
 * Present a fullscreen effect on the canvas surface. Canvas surfaces may only
 * be drawn inside an explicit `frame()`; offscreen targets can use
 * `effect.draw()` directly (which is why headless verification differs).
 */
export function presentFrame(surfaceRef, fx) {
  if (!gpu || gpu === 'failed' || !surfaceRef || !fx) return;
  frame(gpu, (f) => f.pass(surfaceRef, fx));
}

/**
 * Lazily acquire the Gpu context and canvas surface. Resolves
 * `{ gpu, surface }`, or null when WebGPU is unavailable/broken.
 */
export function ensureGpu() {
  if (gpu === 'failed' || !hasWebGPU() || !targetCanvas) return Promise.resolve(null);
  if (gpu && surfaceRef) return Promise.resolve({ gpu, surface: surfaceRef });
  if (!pending) {
    pending = (async () => {
      try {
        gpu = await init();
        surfaceRef = surface(gpu, targetCanvas, { dpr: [1, 2] });
        return { gpu, surface: surfaceRef };
      } catch (err) {
        console.error('WebGPU init failed:', err);
        gpu = 'failed';
        surfaceRef = null;
        return null;
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
}
