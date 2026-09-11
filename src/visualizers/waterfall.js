import { ensureGpu, presentFrame, paramsFromState } from '../gpu.js';
import { makeVgpuBackend } from '../gpu-backend.js';
import historySrc from './shaders/waterfall-history.wgsl';
import displaySrc from './shaders/waterfall-display.wgsl';

// "Ridge" — the spectral history as a perspective mountain range. A
// ping-pong history texture scrolls one column per frame (newest spectrum
// lands at the right edge), and the display pass stacks 56 time slices
// front-to-back with proper occlusion. Loud moments tower over silence.

const HIST_W = 512;
const HIST_H = 64;

export default {
  id: 'ridge',
  name: 'Ridge',
  webgpu: true,
  create() {
    let backend = null;
    let surfaceRef = null;
    let hist = null;
    let ready = false;
    let sinceBeat = 1;

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
        backend.sources = { history: historySrc, display: displaySrc };
        hist = backend.pingPong(HIST_W, HIST_H, { format: 'rgba16float' });
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !backend) return;
        sinceBeat = s.beat ? 0 : sinceBeat + s.dt;
        const params = paramsFromState(s, surfaceRef.size, sinceBeat);

        // Scroll the history one column left, newest spectrum at the edge.
        backend.pass(hist.write, backend.effect('history', backend.sources.history, {
          params: { ...params, resolution: [HIST_W, HIST_H] },
          bins: Array.from(s.freq),
          src: hist.read,
          samp: backend.sampler(),
        }));
        hist.swap();

        const disp = backend.effect('display', backend.sources.display, {
          params,
          src: hist.read,
          samp: backend.sampler(),
        });
        presentFrame(surfaceRef, disp);
      },
    };
  },
};
