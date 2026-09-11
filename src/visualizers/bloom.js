import { ensureGpu, presentFrame, paramsFromState } from '../gpu.js';
import { makeVgpuBackend } from '../gpu-backend.js';
import stepSrc from './shaders/bloom-step.wgsl';
import seedSrc from './shaders/bloom-seed.wgsl';
import displaySrc from './shaders/bloom-display.wgsl';
import fillSrc from './shaders/bloom-fill.wgsl';

// "Bloom" — a Gray-Scott reaction-diffusion colony on a float ping-pong.
// Beats (and treble flickers) drop fresh food so new colonies sprout; ~12
// reaction steps per frame make the pattern grow visibly. Feed rate
// follows bass, kill rate follows treble — the music breeds the pattern.

const RES = 288; // short side; long side follows the aspect
const STEPS = 12;

export default {
  id: 'bloom',
  name: 'Bloom',
  webgpu: true,
  create() {
    let backend = null;
    let surfaceRef = null;
    let field = null;
    let ready = false;
    let sinceBeat = 1;
    let seedPulse = 0; // extra seeding right after init so it starts alive

    function ensureFields(aspect) {
      const w = aspect >= 1 ? Math.round(RES * aspect) : RES;
      const h = aspect >= 1 ? RES : Math.round(RES / aspect);
      if (!field || Math.abs(field.aspect - aspect) > 0.01) {
        field = backend.pingPong(w, h, { format: 'rgba16float' });
        field.aspect = aspect;
        // Gray-Scott needs A≈1 everywhere before the first seeds land —
        // a fresh target is all zeros, and seeds into an A-depleted field
        // burn out instead of nucleating.
        const fill = backend.effect('fill', backend.sources.fill, {});
        backend.pass(field.read, fill);
        backend.pass(field.write, fill);
        seedPulse = 3; // a few early seeds
      }
    }

    return {
      webgpu: true,
      get ready() {
        return ready;
      },
      async init(s) {
        const got = await ensureGpu();
        if (!got) {
          this.unsupported = true;
          return;
        }
        surfaceRef = got.surface;
        backend = makeVgpuBackend(got.gpu);
        backend.sources = { step: stepSrc, seed: seedSrc, display: displaySrc, fill: fillSrc };
        ensureFields(s.width / Math.max(1, s.height));
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !backend) return;
        sinceBeat = s.beat ? 0 : sinceBeat + s.dt;
        ensureFields(s.width / Math.max(1, s.height));
        const params = paramsFromState(s, surfaceRef.size, sinceBeat);
        const res = { ...params, resolution: [field.read.size[0], field.read.size[1]] };
        const samp = backend.sampler();

        // Seed: on beats, on treble flickers, and while booting up.
        const wantSeed = s.beat || seedPulse > 0 || Math.random() < s.treble * 0.25;
        if (wantSeed) {
          if (seedPulse > 0) seedPulse--;
          backend.pass(field.write, backend.effect('seed', backend.sources.seed, {
            params: res,
            seed: [0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, 0.03 + Math.random() * 0.05, 0.9],
            src: field.read,
            samp,
          }));
          field.swap();
        }

        // Reaction steps.
        for (let i = 0; i < STEPS; i++) {
          backend.pass(field.write, backend.effect('step', backend.sources.step, {
            params: res,
            src: field.read,
            samp,
          }));
          field.swap();
        }

        const disp = backend.effect('display', backend.sources.display, {
          params,
          src: field.read,
          samp,
        });
        presentFrame(surfaceRef, disp);
      },
    };
  },
};
