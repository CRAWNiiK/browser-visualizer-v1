import { effect } from 'vgpu';
import { ensureGpu, presentFrame, paramsFromState } from '../gpu.js';
import terrainShader from './shaders/terrain.wgsl';

// "Terrain" — a spectrum-driven mountain range you fly over. The 64-bin
// spectrum becomes the ridge profile across the valley (bass peaks near the
// center, treble foothills wide), the camera streams forward, and beats
// kick the flight speed and pulse the horizon.

export default {
  id: 'terrain',
  name: 'Terrain',
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
        fx = effect(got.gpu, terrainShader, { label: 'terrain' });
        fx.set({
          params: paramsFromState(s, surfaceRef.size, sinceBeat),
          bins: Array.from(s.freq),
        });
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !fx) return;
        sinceBeat = s.beat ? 0 : sinceBeat + s.dt;
        fx.set({
          params: paramsFromState(s, surfaceRef.size, sinceBeat),
          bins: Array.from(s.freq),
        });
        presentFrame(surfaceRef, fx);
      },
    };
  },
};
