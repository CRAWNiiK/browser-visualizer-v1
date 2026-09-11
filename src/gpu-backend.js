// Shared vgpu backend for the multi-pass GPU visualizers (smoke, waterfall,
// ripples, bloom, storm). Wraps effect caching, float targets, ping-pong
// pairs, and per-pass frame submits behind the small seam that
// src/smoke-sim.js and the verify script drive — so the exact same pass
// graph runs against real GPU resources here, against recording stubs in
// tests, and against vgpu/node offscreen targets in headless verification.
//
// Deliberately the same construction shape everywhere: ping-pongs are built
// from two targets (not vgpu's pingPong() helper) because that is the shape
// the headless verification backend uses and has proven out.

import { effect, frame, sampler, target } from 'vgpu';

export function makeVgpuBackend(gpu) {
  const fxCache = new Map();
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  return {
    effect(label, source, bindings) {
      let fx = fxCache.get(label);
      if (!fx) {
        fx = effect(gpu, source, { label });
        fxCache.set(label, fx);
      }
      fx.set(bindings);
      return fx;
    },
    target(w, h, opts) {
      return target(gpu, {
        size: [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))],
        ...opts,
      });
    },
    pingPong(w, h, opts) {
      const mk = () => target(gpu, {
        size: [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))],
        ...opts,
      });
      const pair = { read: mk(), write: mk() };
      return {
        get read() { return pair.read; },
        get write() { return pair.write; },
        swap() { const t = pair.read; pair.read = pair.write; pair.write = t; },
      };
    },
    // Every sim pass is a fullscreen draw, so the default clear is harmless.
    // Each pass submits its own frame — the smoke sim runs 29 per frame and
    // the overhead is negligible next to the passes themselves.
    // `opts` (e.g. { clear: false }) is for accumulation passes (storm).
    pass(tgt, fx, opts) {
      if (opts) {
        frame(gpu, (f) => f.pass({ target: tgt, ...opts }, fx));
      } else {
        frame(gpu, (f) => f.pass(tgt, fx));
      }
    },
    sampler: () => samp,
  };
}
