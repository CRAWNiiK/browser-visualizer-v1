import { effect } from 'vgpu';
import { ensureGpu, presentFrame, paramsFromState } from '../gpu.js';
import auroraShader from './shaders/aurora.wgsl';

// "Aurora" — raymarched volumetric light curtains. Noise sheets shimmer in
// the sky; bass raises the curtain line, treble sparkles, and beats fire a
// pulse sweeping down the light.

export default {
  id: 'aurora',
  name: 'Aurora',
  webgpu: true,
  create() {
    let fx = null;
    let surfaceRef = null;
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
          this.unsupported = true; // no WebGPU — the engine shows a hint
          return;
        }
        surfaceRef = got.surface;
        fx = effect(got.gpu, auroraShader, { label: 'aurora' });
        fx.set({ params: paramsFromState(s, surfaceRef.size, sinceBeat) });
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !fx) return;
        sinceBeat = s.beat ? 0 : sinceBeat + s.dt;
        fx.set({ params: paramsFromState(s, surfaceRef.size, sinceBeat) });
        presentFrame(surfaceRef, fx);
      },
    };
  },
};
