import { ensureGpu, presentFrame } from '../gpu.js';
import { hexToRgb } from '../palette.js';
import { makeVgpuBackend } from '../gpu-backend.js';
import { SIM, emitSplats, simStep, createFields } from '../smoke-sim.js';
import splatSrc from './shaders/smoke-splat.wgsl';
import curlSrc from './shaders/smoke-curl.wgsl';
import vorticitySrc from './shaders/smoke-vorticity.wgsl';
import divergenceSrc from './shaders/smoke-divergence.wgsl';
import pressureSrc from './shaders/smoke-pressure.wgsl';
import gradientSrc from './shaders/smoke-gradient-subtract.wgsl';
import advectSrc from './shaders/smoke-advect.wgsl';
import displaySrc from './shaders/smoke-display.wgsl';

// "Smoke" — a WebGPU reinvention of the classic fluid simulation: dye is
// advected through a velocity field with vorticity confinement and a Jacobi
// pressure solve, audio injects dye and buoyant velocity (bass updraft, mid
// rovers, treble drizzle, beat bursts), and a display pass shades the flow
// with theme colors and an iridescent velocity sheen.
//
// The pass graph lives in src/smoke-sim.js so it can be unit-tested without
// a GPU; this module provides the real WebGPU backend (shared
// makeVgpuBackend factory, float ping-pong targets) and the audio-driven
// emitters.

const SOURCES = {
  splat: splatSrc,
  curl: curlSrc,
  vorticity: vorticitySrc,
  divergence: divergenceSrc,
  pressure: pressureSrc,
  gradient: gradientSrc,
  advect: advectSrc,
  display: displaySrc,
};

export default {
  id: 'smoke',
  name: 'Smoke',
  webgpu: true,
  create() {
    let backend = null;
    let surfaceRef = null;
    let fields = null;
    let ready = false;

    function ensureFields(aspect) {
      if (!fields || Math.abs(fields.aspect - aspect) > 0.01) {
        fields = createFields(backend, aspect);
      }
    }

    function display(s) {
      const base = s.colors[0] || { h: 0, s: 100, l: 62 };
      const fx = backend.effect('display', backend.sources.display, {
        params: {
          time: s.t,
          hue: base.h,
          sat: (base.s ?? 100) / 100,
          light: (base.l ?? 62) / 100,
          intensity: s.intensity,
          background: hexToRgb(s.theme.background),
        },
        src: fields.dye.read,
        src2: fields.velocity.read,
        samp: backend.sampler(),
      });
      presentFrame(surfaceRef, fx);
    }

    return {
      webgpu: true,
      get ready() {
        return ready;
      },
      async init(s) {
        const got = await ensureGpu();
        if (!got) {
          this.unsupported = true; // no WebGPU — the engine shows a hint
          return;
        }
        surfaceRef = got.surface;
        backend = makeVgpuBackend(got.gpu);
        backend.sources = SOURCES;
        ensureFields(s.width / Math.max(1, s.height));
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !backend) return;
        ensureFields(s.width / Math.max(1, s.height));
        simStep(backend, fields, { dt: s.dt, splats: emitSplats(s) });
        display(s);
      },
    };
  },
};
