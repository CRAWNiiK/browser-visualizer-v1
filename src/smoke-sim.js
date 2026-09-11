// Orchestrates the smoke fluid simulation as a sequence of vgpu passes.
// Deliberately framework-agnostic: `backend` abstracts effect creation,
// target creation, and pass execution, so tests can run the exact same
// pass graph against stubs (tests/smoke-sim.test.js) and the browser runs
// it against real WebGPU resources via makeVgpuBackend() (visualizers/smoke.js).

// Tuning constants (unit-space: velocity in uv/second).
export const SIM = {
  CURL: 8,                // vorticity confinement strength (high = busier swirls)
  PRESSURE_ITERATIONS: 20,
  VELOCITY_DISSIPATION: 0.8,  // 1/s decay, high enough that idle motion settles
  DYE_DISSIPATION: 1.1,
  SIM_RES: 192,           // velocity/pressure field resolution (short side)
  DYE_RES: 640,           // dye resolution (short side)
  MAX_SPLATS: 8,          // splat slots per frame (pointer takes slot 0 first)
};

/**
 * Emit audio-driven splats for one frame. Pure: returns the splat list so
 * tests can assert on it directly.
 * @param {object} s engine state (bass, mid, treble, beat, beatEnergy, dt, t, intensity)
 * @param {object} rng injectable randomness: () => [0,1)
 * @returns {Array<{x:number,y:number,radius:number,vel:[number,number]|null,dye:[number,number,number]|null}>}
 */
export function emitSplats(s, rng = Math.random) {
  const splats = [];
  const bass = Math.min(1, s.bass * (0.5 + s.intensity * 0.5));
  const mid = Math.min(1, s.mid);
  const treble = Math.min(1, s.treble);

  // Pointer trail: the user's most direct input, so it takes the first
  // uniform slots and is never crowded out by audio-driven splats. Velocity
  // is clamped to the sim's calm regime; radius and dye swell with speed so
  // slow strokes leave wisps and fast strokes leave bold trails.
  const ptr = s.pointer;
  if (ptr && ptr.active) {
    const VMAX = 1.6; // uv/s — same regime as the audio emitters
    const speed = Math.hypot(ptr.vx, ptr.vy);
    const f = speed > VMAX ? VMAX / speed : 1;
    const k = Math.min(1, speed / VMAX);
    const a = 0.35 + 0.65 * k;
    splats.push({
      x: ptr.x,
      y: ptr.y,
      radius: 0.03 + k * 0.03,
      vel: [ptr.vx * f, ptr.vy * f],
      dye: [0.9 * a, 0.6 * a, 0.4 * a],
    });
  }

  // Bass emitter at the bottom center: a steady updraft that swells with
  // the low end. Velocities are uv/second — kept sub-1.5 so plumes billow
  // across the screen over a couple of seconds instead of snapping across it.
  splats.push({
    x: 0.5,
    y: 0.12,
    radius: 0.09 + bass * 0.14,
    vel: [0, 0.45 + bass * 0.95],
    dye: [bass * 0.7, bass * 0.4, bass * 0.2],
  });

  // Mid-band rovers: wandering emitters that paint sideways dye.
  for (let i = 0; i < 2; i++) {
    const phase = s.t * (0.35 + i * 0.17) + i * 2.4;
    const x = 0.5 + Math.sin(phase) * 0.36;
    const y = 0.35 + Math.sin(phase * 1.31 + i) * 0.22;
    const dx = Math.cos(phase) * (0.18 + mid * 0.45);
    splats.push({
      x,
      y,
      radius: 0.05 + mid * 0.09,
      vel: [dx, 0.06 + mid * 0.18],
      dye: [mid * 0.5, mid * 0.7, mid * 0.35],
    });
  }

  // Treble drizzle: fine, fast, flickery specks.
  if (treble > 0.05 && rng() < 0.5 + treble * 0.5) {
    splats.push({
      x: rng(),
      y: rng() * 0.9 + 0.05,
      radius: 0.012 + treble * 0.02,
      vel: [(rng() - 0.5) * 0.9, 0.15 + treble * 0.45],
      dye: [treble * 0.35, treble * 0.45, treble * 0.6],
    });
  }

  // Beat burst: a ring of high-velocity splats fired outward from the bass
  // emitter when a beat fires.
  if (s.beat && s.beatEnergy > 0.05) {
    const arms = 3;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + s.t * 0.7;
      splats.push({
        x: 0.5 + Math.cos(a) * 0.06,
        y: 0.12 + Math.sin(a) * 0.04,
        radius: 0.06 + s.beatEnergy * 0.05,
        vel: [Math.cos(a) * 0.85 * s.beatEnergy, Math.abs(Math.sin(a)) * 0.6 * s.beatEnergy + 0.15],
        dye: [0.9 * s.beatEnergy, 0.6 * s.beatEnergy, 0.2 * s.beatEnergy],
      });
    }
  }

  // Keep the most impactful splats: bass emitter first, then beats, then
  // rovers, then drizzle.
  return splats.slice(0, SIM.MAX_SPLATS);
}

/**
 * Pack a splat list into the SplatParams uniform shape. `mode` selects the
 * value channel: 'velocity' packs [vx, vy, 0, 0], 'dye' packs [r, g, b, 0].
 */
export function packSplats(splats, aspect, mode) {
  const packed = {
    count: Math.min(splats.length, SIM.MAX_SPLATS),
    aspect,
    s0: [0, 0, 0, 0], s1: [0, 0, 0, 0], s2: [0, 0, 0, 0], s3: [0, 0, 0, 0],
    s4: [0, 0, 0, 0], s5: [0, 0, 0, 0], s6: [0, 0, 0, 0], s7: [0, 0, 0, 0],
    v0: [0, 0, 0, 0], v1: [0, 0, 0, 0], v2: [0, 0, 0, 0], v3: [0, 0, 0, 0],
    v4: [0, 0, 0, 0], v5: [0, 0, 0, 0], v6: [0, 0, 0, 0], v7: [0, 0, 0, 0],
  };
  splats.forEach((sp, i) => {
    if (i >= SIM.MAX_SPLATS) return;
    packed[`s${i}`] = [sp.x, sp.y, sp.radius, 1];
    packed[`v${i}`] = mode === 'dye'
      ? [sp.dye?.[0] ?? 0, sp.dye?.[1] ?? 0, sp.dye?.[2] ?? 0, 0]
      : [sp.vel?.[0] ?? 0, sp.vel?.[1] ?? 0, 0, 0];
  });
  return packed;
}

/**
 * Run one simulation step. `backend` must provide:
 *   effect(label, source, bindingsObj) -> effect with .set(obj) semantics
 *   target(w, h, opts) -> target
 *   pingPong(w, h, opts) -> { read, write, swap() }
 *   pass(target, effect) -> runs one fullscreen pass into target
 *   sampler() -> filtering sampler
 * `sources` maps: { splat, curl, vorticity, divergence, pressure, gradient, advect }
 */
export function simStep(backend, fields, input) {
  const { dt, splats } = input;
  const clampDt = Math.min(Math.max(dt, 1 / 240), 1 / 30);
  const aspect = fields.aspect;

  // 1. Splat velocity.
  backend.pass(fields.velocity.write, backend.effect('splat-vel', backend.sources.splat, {
    params: packSplats(splats, aspect, 'velocity'),
    src: fields.velocity.read,
    samp: backend.sampler(),
  }));
  fields.velocity.swap();

  // 2. Splat dye.
  backend.pass(fields.dye.write, backend.effect('splat-dye', backend.sources.splat, {
    params: packSplats(splats, aspect, 'dye'),
    src: fields.dye.read,
    samp: backend.sampler(),
  }));
  fields.dye.swap();

  // 3. Curl.
  backend.pass(fields.curl, backend.effect('curl', backend.sources.curl, {
    params: simParams(clampDt, fields),
    src: fields.velocity.read,
    samp: backend.sampler(),
  }));

  // 4. Vorticity confinement.
  backend.pass(fields.velocity.write, backend.effect('vorticity', backend.sources.vorticity, {
    params: simParams(clampDt, fields),
    src: fields.velocity.read,
    src2: fields.curl,
    samp: backend.sampler(),
  }));
  fields.velocity.swap();

  // 5. Divergence.
  backend.pass(fields.divergence, backend.effect('divergence', backend.sources.divergence, {
    params: simParams(clampDt, fields),
    src: fields.velocity.read,
    samp: backend.sampler(),
  }));

  // 6. Pressure solve (Jacobi). The pressure field persists across frames
  // (warm start), so no clear is needed — it also helps convergence.
  for (let i = 0; i < SIM.PRESSURE_ITERATIONS; i++) {
    backend.pass(fields.pressure.write, backend.effect('pressure', backend.sources.pressure, {
      params: simParams(clampDt, fields),
      src: fields.pressure.read,
      src2: fields.divergence,
      samp: backend.sampler(),
    }));
    fields.pressure.swap();
  }

  // 7. Gradient subtract.
  backend.pass(fields.velocity.write, backend.effect('gradient', backend.sources.gradient, {
    params: simParams(clampDt, fields),
    src: fields.pressure.read,
    src2: fields.velocity.read,
    samp: backend.sampler(),
  }));
  fields.velocity.swap();

  // 8. Advect velocity (self-advection).
  backend.pass(fields.velocity.write, backend.effect('advect-vel', backend.sources.advect, {
    params: { ...simParams(clampDt, fields), dissipation: SIM.VELOCITY_DISSIPATION },
    src: fields.velocity.read,
    src2: fields.velocity.read,
    samp: backend.sampler(),
  }));
  fields.velocity.swap();

  // 9. Advect dye.
  backend.pass(fields.dye.write, backend.effect('advect-dye', backend.sources.advect, {
    params: { ...simParams(clampDt, fields), dissipation: SIM.DYE_DISSIPATION },
    src: fields.velocity.read,
    src2: fields.dye.read,
    samp: backend.sampler(),
  }));
  fields.dye.swap();
}

function simParams(dt, fields) {
  return {
    dt,
    texel: fields.simTexel,
    aspect: fields.aspect,
    dissipation: 0,
    curlStrength: SIM.CURL,
    time: 0,
  };
}

/**
 * Create fields for the sim. aspect = width/height of the output canvas.
 */
export function createFields(backend, aspect) {
  const simW = aspect >= 1 ? Math.round(SIM.SIM_RES * aspect) : SIM.SIM_RES;
  const simH = aspect >= 1 ? SIM.SIM_RES : Math.round(SIM.SIM_RES / aspect);
  const dyeW = aspect >= 1 ? Math.round(SIM.DYE_RES * aspect) : SIM.DYE_RES;
  const dyeH = aspect >= 1 ? SIM.DYE_RES : Math.round(SIM.DYE_RES / aspect);
  const opts = { format: 'rgba16float' };
  return {
    aspect,
    simTexel: [1 / simW, 1 / simH],
    dyeTexel: [1 / dyeW, 1 / dyeH],
    velocity: backend.pingPong(simW, simH, opts),
    dye: backend.pingPong(dyeW, dyeH, opts),
    pressure: backend.pingPong(simW, simH, opts),
    curl: backend.target(simW, simH, opts),
    divergence: backend.target(simW, simH, opts),
  };
}
