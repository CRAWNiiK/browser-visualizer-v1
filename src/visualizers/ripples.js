import { ensureGpu, presentFrame, paramsFromState } from '../gpu.js';
import { makeVgpuBackend } from '../gpu-backend.js';
import splatSrc from './shaders/ripple-splat.wgsl';
import stepSrc from './shaders/ripple-step.wgsl';
import displaySrc from './shaders/ripple-display.wgsl';

// "Ripples" — a dark pond driven by the wave equation on two float
// ping-pongs (current + previous height fields). Treble sprinkles
// raindrops, beats splash the pond, bass rolls slow swells; the display
// pass shades normals into specular glints and fresnel tint.

const RES = 320; // short side; long side follows the aspect

export default {
  id: 'ripples',
  name: 'Ripples',
  webgpu: true,
  create() {
    let backend = null;
    let surfaceRef = null;
    let curr = null;
    let prev = null;
    let ready = false;
    let sinceBeat = 1;

    function ensureFields(aspect) {
      const w = aspect >= 1 ? Math.round(RES * aspect) : RES;
      const h = aspect >= 1 ? RES : Math.round(RES / aspect);
      if (!curr || Math.abs(curr.aspect - aspect) > 0.01) {
        const opts = { format: 'rgba16float' };
        curr = backend.pingPong(w, h, opts);
        prev = backend.pingPong(w, h, opts);
        curr.aspect = aspect;
      }
    }

    // Up to five splats per frame: [x, y (uv, y up), radius, amplitude].
    function computeDrops(s) {
      const drops = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
      let i = 0;
      // Beat splash: a big drop near the middle.
      if (s.beat && s.beatEnergy > 0.05) {
        drops[i++] = [0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.4, 0.045 + s.beatEnergy * 0.03, 0.9 * s.beatEnergy];
      }
      // Treble rain: fine, frequent, scattered.
      const rain = Math.min(3, Math.floor(s.treble * 3.4));
      for (let r = 0; r < rain && i < 5; r++) {
        drops[i++] = [Math.random(), Math.random(), 0.008 + Math.random() * 0.012, 0.35 + s.treble * 0.4];
      }
      // Bass swell: slow and wide, always rolling a little.
      drops[i] = [0.5 + Math.sin(s.t * 0.4) * 0.3, 0.5 + Math.cos(s.t * 0.31) * 0.25, 0.14 + s.bass * 0.12, s.bass * 0.12];
      return drops;
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
        backend.sources = { splat: splatSrc, step: stepSrc, display: displaySrc };
        ensureFields(s.width / Math.max(1, s.height));
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !backend) return;
        sinceBeat = s.beat ? 0 : sinceBeat + s.dt;
        ensureFields(s.width / Math.max(1, s.height));
        const params = paramsFromState(s, surfaceRef.size, sinceBeat);
        const samp = backend.sampler();

        // 1. Splat drops into the current field.
        backend.pass(curr.write, backend.effect('splat', backend.sources.splat, {
          params: { ...params, resolution: [curr.read.size[0], curr.read.size[1]] },
          drops: computeDrops(s),
          src: curr.read,
          samp,
        }));
        curr.swap();

        // 2. Wave-equation step: next = 0.5*lap(curr) - prev, into prev's
        //    slot; after swapping, prev.read is the new current field.
        backend.pass(prev.write, backend.effect('step', backend.sources.step, {
          params: { ...params, resolution: [curr.read.size[0], curr.read.size[1]] },
          src: curr.read,
          src2: prev.read,
          samp,
        }));
        prev.swap();

        // 3. Swap roles: prev now holds the newest field.
        [curr, prev] = [prev, curr];

        const disp = backend.effect('display', backend.sources.display, {
          params,
          src: curr.read,
          samp,
        });
        presentFrame(surfaceRef, disp);
      },
    };
  },
};
