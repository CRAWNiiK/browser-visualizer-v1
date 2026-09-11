import { describe, it, expect } from 'vitest';
import { SIM, emitSplats, packSplats, simStep, createFields } from '../src/smoke-sim.js';

// A recording backend: runs the exact same pass graph as the browser but
// only records what was called, so the orchestrator's logic is testable
// without a GPU.
function makeRecordingBackend() {
  const calls = [];
  const makeTarget = (name) => ({ name, size: [64, 64] });
  return {
    calls,
    sources: { splat: 'splat', curl: 'curl', vorticity: 'vorticity', divergence: 'divergence', pressure: 'pressure', gradient: 'gradient', advect: 'advect' },
    effect(label, source, bindings) {
      const rec = { label, bindings };
      calls.push(rec);
      return rec;
    },
    target(w, h, opts) {
      const t = makeTarget(`target${calls.length}`);
      t.size = [w, h];
      return t;
    },
    pingPong(w, h, opts) {
      const pair = { read: makeTarget('read'), write: makeTarget('write'), swaps: 0 };
      pair.read.size = [w, h];
      pair.write.size = [w, h];
      return {
        get read() { return pair.read; },
        get write() { return pair.write; },
        get swaps() { return pair.swaps; },
        swap() { const t = pair.read; pair.read = pair.write; pair.write = t; pair.swaps++; },
      };
    },
    pass(tgt, fx) {
      calls.push({ pass: tgt.name, effect: fx.label, bindings: fx.bindings });
    },
    sampler: () => 'sampler',
  };
}

describe('emitSplats', () => {
  const quiet = { bass: 0, mid: 0, treble: 0, beat: false, beatEnergy: 0, t: 0, intensity: 1 };
  const loud = { bass: 0.9, mid: 0.7, treble: 0.6, beat: true, beatEnergy: 1, t: 5, intensity: 2 };

  it('always emits the bass emitter', () => {
    const splats = emitSplats(quiet);
    expect(splats.length).toBeGreaterThan(0);
    expect(splats[0].vel[1]).toBeGreaterThan(0); // upward buoyancy
  });

  it('swells the bass emitter with bass energy', () => {
    const quietSplat = emitSplats(quiet)[0];
    const loudSplat = emitSplats(loud)[0];
    expect(loudSplat.radius).toBeGreaterThan(quietSplat.radius);
    expect(loudSplat.vel[1]).toBeGreaterThan(quietSplat.vel[1]);
  });

  it('fires a beat burst only on beats', () => {
    const quietCount = emitSplats(quiet).length;
    const loudCount = emitSplats(loud).length;
    expect(loudCount).toBeGreaterThan(quietCount);
    // And never more than the uniform's slot count.
    expect(loudCount).toBeLessThanOrEqual(SIM.MAX_SPLATS);
  });

  it('is capped at MAX_SPLATS', () => {
    const splats = emitSplats(loud);
    expect(splats.length).toBeLessThanOrEqual(SIM.MAX_SPLATS);
  });
});

describe('pointer splats', () => {
  const base = { bass: 0, mid: 0, treble: 0, beat: false, beatEnergy: 0, t: 0, intensity: 1 };

  it('takes priority as the first splat while the pointer is active', () => {
    const splats = emitSplats({ ...base, pointer: { active: true, x: 0.3, y: 0.7, vx: 0.5, vy: -0.2 } });
    expect(splats[0].x).toBe(0.3);
    expect(splats[0].y).toBe(0.7);
    expect(splats[0].vel[0]).toBe(0.5);
    expect(splats[0].vel[1]).toBe(-0.2);
  });

  it('clamps runaway pointer velocity to the calm regime, keeping direction', () => {
    const [vx, vy] = emitSplats({ ...base, pointer: { active: true, x: 0.5, y: 0.5, vx: 9, vy: -4 } })[0].vel;
    expect(Math.hypot(vx, vy)).toBeLessThanOrEqual(1.6001);
    expect(vx).toBeGreaterThan(0);
    expect(vy).toBeLessThan(0);
  });

  it('adds nothing for an inactive or absent pointer', () => {
    const baseline = emitSplats(base).length;
    const idle = { ...base, pointer: { active: false, x: 0.5, y: 0.5, vx: 0, vy: 0 } };
    expect(emitSplats(idle).length).toBe(baseline);
    expect(emitSplats(base).length).toBe(baseline);
  });

  it('swells radius and dye with pointer speed', () => {
    const slow = emitSplats({ ...base, pointer: { active: true, x: 0.5, y: 0.5, vx: 0.1, vy: 0 } })[0];
    const fast = emitSplats({ ...base, pointer: { active: true, x: 0.5, y: 0.5, vx: 1.6, vy: 0 } })[0];
    expect(fast.radius).toBeGreaterThan(slow.radius);
    expect(fast.dye[0]).toBeGreaterThan(slow.dye[0]);
  });

  it('packs up to eight slots and caps the count', () => {
    const mk = (x) => ({ x, y: 0.2, radius: 0.05, vel: [1, 0], dye: [1, 1, 1] });
    const eight = Array.from({ length: 8 }, (_, i) => mk(i / 10));
    const p = packSplats(eight, 1.6, 'velocity');
    expect(p.count).toBe(8);
    expect(p.s7).toEqual([0.7, 0.2, 0.05, 1]);
    const over = packSplats([...eight, ...eight], 1.6, 'velocity');
    expect(over.count).toBe(SIM.MAX_SPLATS);
  });
});

describe('packSplats', () => {
  const splats = [
    { x: 0.5, y: 0.1, radius: 0.2, vel: [0, 2], dye: [0.8, 0.4, 0.1] },
  ];

  it('packs velocity in mode velocity', () => {
    const p = packSplats(splats, 1.6, 'velocity');
    expect(p.count).toBe(1);
    expect(p.aspect).toBe(1.6);
    expect(p.s0).toEqual([0.5, 0.1, 0.2, 1]);
    expect(p.v0).toEqual([0, 2, 0, 0]);
  });

  it('packs dye in mode dye', () => {
    const p = packSplats(splats, 1.6, 'dye');
    expect(p.v0).toEqual([0.8, 0.4, 0.1, 0]);
  });

  it('fills unused slots with zeros', () => {
    const p = packSplats([], 1.0, 'velocity');
    expect(p.count).toBe(0);
    expect(p.s5).toEqual([0, 0, 0, 0]);
    expect(p.v3).toEqual([0, 0, 0, 0]);
  });
});

describe('simStep pass graph', () => {
  it('runs splats, curl, vorticity, divergence, pressure xN, gradient, advection in order', () => {
    const backend = makeRecordingBackend();
    const fields = createFields(backend, 1.6);
    backend.calls.length = 0;

    simStep(backend, fields, { dt: 1 / 60, splats: emitSplats({ bass: 0.5, mid: 0.5, treble: 0.2, beat: false, beatEnergy: 0, t: 1, intensity: 1 }) });

    const labels = backend.calls.filter((c) => c.pass).map((c) => c.effect);
    expect(labels[0]).toBe('splat-vel');
    expect(labels[1]).toBe('splat-dye');
    expect(labels[2]).toBe('curl');
    expect(labels[3]).toBe('vorticity');
    expect(labels[4]).toBe('divergence');
    const pressureRuns = labels.filter((l) => l === 'pressure').length;
    expect(pressureRuns).toBe(SIM.PRESSURE_ITERATIONS);
    expect(labels[5 + pressureRuns]).toBe('gradient');
    expect(labels.at(-2)).toBe('advect-vel');
    expect(labels.at(-1)).toBe('advect-dye');
  });

  it('splits velocity and dye splats into separate passes with the right packing', () => {
    const backend = makeRecordingBackend();
    const fields = createFields(backend, 1.6);
    backend.calls.length = 0;

    simStep(backend, fields, { dt: 1 / 60, splats: [{ x: 0.5, y: 0.1, radius: 0.2, vel: [0, 2], dye: [0.9, 0.5, 0.2] }] });

    const splatPasses = backend.calls.filter((c) => c.pass && c.effect.startsWith('splat'));
    expect(splatPasses.map((c) => c.effect)).toEqual(['splat-vel', 'splat-dye']);
    const velParams = splatPasses[0].bindings.params;
    const dyeParams = splatPasses[1].bindings.params;
    expect(velParams.v0).toEqual([0, 2, 0, 0]);
    expect(dyeParams.v0).toEqual([0.9, 0.5, 0.2, 0]);
  });

  it('swaps ping-pong targets after each state-mutating pass', () => {
    const backend = makeRecordingBackend();
    const fields = createFields(backend, 1.6);

    simStep(backend, fields, { dt: 1 / 60, splats: [] });

    // Velocity mutates 4x (splat, vorticity, gradient, advect-vel), dye 2x
    // (splat, advect-dye), pressure once per Jacobi iteration.
    expect(fields.velocity.swaps).toBe(4);
    expect(fields.dye.swaps).toBe(2);
    expect(fields.pressure.swaps).toBe(SIM.PRESSURE_ITERATIONS);
  });

  it('clamps extreme dt values', () => {
    const backend = makeRecordingBackend();
    const fields = createFields(backend, 1.0);
    backend.calls.length = 0;

    simStep(backend, fields, { dt: 5.0, splats: [] });
    const advect = backend.calls.find((c) => c.effect === 'advect-vel');
    expect(advect.bindings.params.dt).toBeLessThanOrEqual(1 / 30);
  });
});

describe('createFields', () => {
  it('scales field sizes by aspect ratio', () => {
    const backend = makeRecordingBackend();
    const wide = createFields(backend, 2.0);
    const tall = createFields(backend, 0.5);
    expect(wide.velocity.read.size[0]).toBeGreaterThan(wide.velocity.read.size[1]);
    expect(tall.velocity.read.size[0]).toBeLessThan(tall.velocity.read.size[1]);
  });
});
