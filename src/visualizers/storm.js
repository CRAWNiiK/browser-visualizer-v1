import { compute, draw, storage } from 'vgpu';
import { ensureGpu, presentFrame, paramsFromState } from '../gpu.js';
import { makeVgpuBackend } from '../gpu-backend.js';
import simSrc from './shaders/storm-compute.wgsl';
import particlesSrc from './shaders/storm-particles.wgsl';
import fadeSrc from './shaders/storm-fade.wgsl';
import displaySrc from './shaders/storm-display.wgsl';

// "Storm" — a GPU particle storm. One compute kernel advects a 200k-particle
// storage buffer through the curl of a noise field (bass strengthens the
// swirl, beats fire radial shockwaves, treble jitters); an instanced draw
// splats each particle as a velocity-stretched streak with additive
// blending into a trail accumulation target, and a display pass tonemaps
// the wakes onto the theme background.
//
// Buffer cost: 80k x 16 bytes = 1.28 MB of VRAM. The heavy part is compute
// throughput — integrated GPUs handle it, older cards may drop below 60fps
// (the intensity slider doesn't help; pick a lighter visualizer instead).

const COUNT = 80_000;
const WORKGROUP = 64;

export default {
  id: 'storm',
  name: 'Storm',
  webgpu: true,
  create() {
    let backend = null;
    let surfaceRef = null;
    let buf = null;
    let sim = null;
    let particlesFx = null;
    let accum = null;
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
        backend.sources = { fade: fadeSrc, display: displaySrc };

        buf = storage(got.gpu, COUNT * 16, 'read-write');
        // Scatter initial positions across the frame, velocities at rest.
        const init = new Float32Array(COUNT * 4);
        for (let i = 0; i < COUNT; i++) {
          init[i * 4] = Math.random();
          init[i * 4 + 1] = Math.random();
        }
        buf.write(init);

        sim = compute(got.gpu, simSrc, { label: 'storm-sim' });
        // Instancing lives on draw() units, not effect() — effect() ignores
        // instances/vertices/blend and would silently render one triangle.
        particlesFx = draw(got.gpu, {
          shader: particlesSrc,
          label: 'storm-particles',
          instances: COUNT,
          vertices: 6,
          blend: 'additive',
        });

        // Half-resolution accumulation target — trails are soft anyway and
        // this quarters the fill cost on weaker GPUs.
        const w = Math.max(320, Math.round(s.width / 2));
        const h = Math.max(180, Math.round(s.height / 2));
        accum = backend.pingPong(w, h, { format: 'rgba16float' });
        ready = true;
      },
      draw(_gpu, s) {
        if (!ready || !backend) return;
        sinceBeat = s.beat ? 0 : sinceBeat + s.dt;
        const params = paramsFromState(s, surfaceRef.size, sinceBeat);
        const samp = backend.sampler();

        // 1. Advect the swarm (compute submits its own pass; queue order
        //    guarantees it lands before the draws below).
        sim.set({ params, particles: buf });
        sim.dispatch(Math.ceil(COUNT / WORKGROUP));

        // 2. Decay the trails, then splat this frame's streaks additively
        //    on top (clear: false preserves the faded content).
        backend.pass(accum.write, backend.effect('fade', backend.sources.fade, {
          params,
          src: accum.read,
          samp,
        }));
        accum.swap();
        particlesFx.set({ params, particles: buf });
        backend.pass(accum.read, particlesFx, { clear: false });

        // 3. Tonemap the wakes onto the theme background.
        const disp = backend.effect('display', backend.sources.display, {
          params: { ...params, resolution: [accum.read.size[0], accum.read.size[1]] },
          src: accum.read,
          samp,
        });
        presentFrame(surfaceRef, disp);
      },
    };
  },
};
