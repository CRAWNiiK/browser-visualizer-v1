import { effect } from 'vgpu';
import { ensureGpu, presentFrame } from '../gpu.js';
import { hexToRgb } from '../palette.js';
import nebulaShader from './shaders/nebula.wgsl';

// "Nebula" — a WebGPU visualizer: volumetric simplex-fbm clouds that swell
// with the bass, drift their hue with the mids, fire lightning filaments on
// the beat, and twinkle with the treble. Mirror mode folds it into a
// kaleidoscope, all inside the shader.

export default {
  id: 'nebula',
  name: 'Nebula',
  webgpu: true,
  create() {
    let fx = null;
    let surfaceRef = null;
    let ready = false;
    let sinceBeat = 1;

    function setParams(s) {
      const size = surfaceRef.size;
      const base = s.colors[0] || { h: 0, s: 100, l: 62 };
      fx.set({
        params: {
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
        },
      });
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
        fx = effect(got.gpu, nebulaShader, { label: 'nebula' });
        setParams(s);
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !fx) return;
        sinceBeat = s.beat ? 0 : sinceBeat + s.dt;
        setParams(s);
        presentFrame(surfaceRef, fx);
      },
    };
  },
};
