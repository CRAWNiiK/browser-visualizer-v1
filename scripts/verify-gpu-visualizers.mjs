// Headless verification for the WebGPU visualizer shaders, following vgpu's
// static-render workflow: resolve each .wgsl import graph, render on a real
// (Dawn) device, read the pixels back, and assert the images look like the
// intended scene (non-empty, spatially structured, audio-reactive).
//
//   node scripts/verify-gpu-visualizers.mjs
//
// Writes frame dumps to .vgpu-frames/*.ppm for manual inspection.

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveShader } from '@vgpu/wgsl/runtime';
import { compute, draw, effect, frame, init, sampler, storage, target } from 'vgpu/node';
import { SIM, emitSplats, simStep, createFields } from '../src/smoke-sim.js';

const OUT_DIR = '.vgpu-frames';
mkdirSync(OUT_DIR, { recursive: true });

// Mirrors the engine state the app would feed the shader at a loud,
// beat-heavy moment vs a quiet one.
function audioParams(t, { bass = 0, mid = 0, treble = 0, beatEnergy = 0, beatTime = 9, intensity = 1 } = {}) {
  return {
    time: t,
    dt: 1 / 60,
    bass,
    mid,
    treble,
    level: bass * 0.5 + mid * 0.3 + treble * 0.2,
    beatEnergy,
    beatTime,
    intensity,
    hue: 185,
    sat: 1,
    light: 0.62,
    mirror: 0,
    resolution: [320, 180],
    background: [0.02, 0.024, 0.06],
  };
}

function stats(pixels) {
  let sum = 0;
  let min = 255;
  let max = 0;
  let lit = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const lum = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
    sum += lum;
    if (lum < min) min = lum;
    if (lum > max) max = lum;
    if (lum > 20) lit++;
  }
  return { mean: sum / (pixels.length / 4), min, max, litFrac: lit / (pixels.length / 4) };
}

// Fraction of pixels that differ by more than a threshold between two frames.
// Max over RGB — a red-only comparison is nearly blind to cyan/blue palettes
// (theme hue 185° has almost no red).
function diffFrac(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(
      Math.abs(a[i] - b[i]),
      Math.abs(a[i + 1] - b[i + 1]),
      Math.abs(a[i + 2] - b[i + 2]),
    );
    if (d > 12) diff++;
  }
  return diff / (a.length / 4);
}

// Structural check: enough variance across the image that it isn't a flat
// fill. Compares luminance across radial bands from the center — a real scene
// (even a radially symmetric one) differs between center and edge.
function radialSpread(pixels, w, h) {
  const means = [0, 0, 0];
  const counts = [0, 0, 0];
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(cx, cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = Math.hypot(x - cx, y - cy) / maxR;
      const q = r < 0.4 ? 0 : r < 0.8 ? 1 : 2;
      means[q] += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      counts[q]++;
    }
  }
  const m = means.map((s, i) => s / counts[i]);
  return Math.max(...m) - Math.min(...m);
}

function writePpm(name, pixels, w, h) {
  const header = Buffer.from(`P6\n${w} ${h}\n255\n`);
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
    rgb[j] = pixels[i];
    rgb[j + 1] = pixels[i + 1];
    rgb[j + 2] = pixels[i + 2];
  }
  writeFileSync(`${OUT_DIR}/${name}.ppm`, Buffer.concat([header, rgb]));
}

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok  ${name} ${detail}`);
  } else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

const W = 320;
const H = 180;
const gpu = await init();

// ---------- Nebula (single-pass fullscreen effect) ----------
{
  console.log('\nnebula (src/visualizers/shaders/nebula.wgsl)');
  const resolved = await resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/nebula.wgsl', import.meta.url)) });
  const tgt = target(gpu, { size: [W, H] });
  const fx = effect(gpu, resolved.wgsl, { label: 'nebula' });

  fx.set({ params: audioParams(3.0) });
  fx.draw(tgt);
  const quiet = await tgt.read();
  writePpm('nebula-quiet', quiet, W, H);
  const qs = stats(quiet);
  check('quiet: not blank', qs.mean > 4 && qs.litFrac > 0.02, `(mean ${qs.mean.toFixed(1)}, lit ${(qs.litFrac * 100).toFixed(0)}%)`);
  check('quiet: structured', radialSpread(quiet, W, H) > 6, `(radial spread ${radialSpread(quiet, W, H).toFixed(1)})`);

  fx.set({ params: audioParams(8.0, { bass: 0.85, mid: 0.6, treble: 0.5, beatEnergy: 1, beatTime: 0 }) });
  fx.draw(tgt);
  const loud = await tgt.read();
  writePpm('nebula-loud', loud, W, H);
  const ls = stats(loud);
  check('loud: brighter than quiet', ls.mean > qs.mean * 1.25, `(mean ${ls.mean.toFixed(1)} vs ${qs.mean.toFixed(1)})`);
  check('loud: highlights present', ls.max > 150, `(max ${ls.max})`);

  fx.set({ params: audioParams(30.0) });
  fx.draw(tgt);
  const later = await tgt.read();
  const diffFrac = (() => {
    let diff = 0;
    for (let i = 0; i < later.length; i += 4) {
      if (Math.abs(later[i] - quiet[i]) > 12) diff++;
    }
    return diff / (later.length / 4);
  })();
  check('animated: image changes over time', diffFrac > 0.05, `(${(diffFrac * 100).toFixed(0)}% pixels changed)`);

  tgt.destroy?.();
}

// ---------- Smoke (multi-pass fluid sim through the backend seam) ----------
{
  console.log('\nsmoke (fluid sim via src/smoke-sim.js + display pass)');
  const sources = {};
  for (const name of ['splat', 'curl', 'vorticity', 'divergence', 'pressure', 'gradient-subtract', 'advect', 'display']) {
    const resolved = await resolveShader({ entry: fileURLToPath(new URL(`../src/visualizers/shaders/smoke-${name}.wgsl`, import.meta.url)) });
    sources[name] = resolved.wgsl;
  }

  // The same backend shape visualizers/smoke.js builds over 'vgpu', but on
  // vgpu/node with offscreen targets (draw() is legal outside frame() there).
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  const fxCache = new Map();
  const backend = {
    sources: {
      splat: sources.splat,
      curl: sources.curl,
      vorticity: sources.vorticity,
      divergence: sources.divergence,
      pressure: sources.pressure,
      gradient: sources['gradient-subtract'],
      advect: sources.advect,
      display: sources.display,
    },
    effect(label, source, bindings) {
      let fx = fxCache.get(label);
      if (!fx) {
        fx = effect(gpu, source, { label });
        fxCache.set(label, fx);
      }
      fx.set(bindings);
      return fx;
    },
    target(w, h, opts) {
      return target(gpu, { size: [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))], ...opts });
    },
    pingPong(w, h, opts) {
      const pair = {
        read: target(gpu, { size: [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))], ...opts }),
        write: target(gpu, { size: [Math.max(1, Math.round(w)), Math.max(1, Math.round(h))], ...opts }),
      };
      return {
        get read() { return pair.read; },
        get write() { return pair.write; },
        swap() { const t = pair.read; pair.read = pair.write; pair.write = t; },
      };
    },
    pass(tgt, fx) {
      fx.draw(tgt);
    },
    sampler: () => samp,
  };

  const fields = createFields(backend, W / H);
  const displayFx = () => backend.effect('display', backend.sources.display, {});

  // Run the sim for a second of loud, beat-heavy audio, then display.
  let lastLoud = null;
  for (let i = 0; i < 60; i++) {
    const beat = i % 24 === 12;
    const s = {
      t: i / 60,
      dt: 1 / 60,
      bass: 0.85,
      mid: 0.6,
      treble: 0.5,
      beat,
      beatEnergy: beat ? 1 : (lastLoud ?? 0) * 0.9,
      intensity: 1.2,
    };
    if (beat) lastLoud = 1;
    simStep(backend, fields, { dt: 1 / 60, splats: emitSplats(s) });
  }

  const disp = displayFx();
  disp.set({
    params: {
      time: 1,
      hue: 185,
      sat: 1,
      light: 0.62,
      intensity: 1.2,
      background: [0.02, 0.024, 0.06],
    },
    src: fields.dye.read,
    src2: fields.velocity.read,
    samp: samp,
  });
  const out = target(gpu, { size: [W, H] });
  disp.draw(out);
  const pixels = await out.read();
  writePpm('smoke-loud', pixels, W, H);
  const ss = stats(pixels);
  check('sim: dye visible after 60 steps', ss.mean > 6 && ss.litFrac > 0.02, `(mean ${ss.mean.toFixed(1)}, lit ${(ss.litFrac * 100).toFixed(0)}%)`);
  check('sim: structured field', radialSpread(pixels, W, H) > 6, `(radial spread ${radialSpread(pixels, W, H).toFixed(1)})`);
  check('sim: bounded energy (no blow-up)', ss.max <= 255 && ss.mean < 200, `(max ${ss.max.toFixed(1)})`);

  // Ground-truth dye level, straight from the float target (independent of
  // the display pass's tonemapping curve).
  async function dyeMean() {
    const f = await fields.dye.read.readFloats();
    let sum = 0;
    for (let i = 0; i < f.length; i += 4) sum += f[i];
    return sum / (f.length / 4);
  }
  const dyeLoud = await dyeMean();

  // Stop all emission for 4 seconds: dissipation + advection must dim the
  // field (the sim runs with zero splats, isolating the decay behavior).
  for (let i = 0; i < 240; i++) {
    simStep(backend, fields, { dt: 1 / 60, splats: [] });
  }
  const dyeQuiet = await dyeMean();
  check('sim: dye field dissipates', dyeQuiet < dyeLoud * 0.4, `(dye mean ${dyeQuiet.toFixed(3)} < 40% of loud ${dyeLoud.toFixed(3)})`);

  disp.set({ src: fields.dye.read, src2: fields.velocity.read });
  disp.draw(out);
  const quietPixels = await out.read();
  writePpm('smoke-quiet', quietPixels, W, H);
  const qs2 = stats(quietPixels);
  check('sim: display dims as dye fades', qs2.mean < ss.mean * 0.8, `(decayed mean ${qs2.mean.toFixed(1)} < 80% of loud mean ${ss.mean.toFixed(1)})`);

  // Pointer trail: dye-mass moments measured straight from the float field.
  // After the decay phase the only dye left is the bass emitter's column
  // near x=0.5 — a narrow vertical smear that serves as the control.
  const measure = async () => {
    const f = await fields.dye.read.readFloats();
    const w = Math.round(1 / fields.dyeTexel[0]);
    const h = Math.round(1 / fields.dyeTexel[1]);
    let sum = 0, sx = 0, sxx = 0, sy = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = f[(y * w + x) * 4];
        if (v > 0.02) {
          sum += v;
          sx += v * x;
          sxx += v * x * x;
          sy += v * y;
        }
      }
    }
    if (sum <= 0) return { mean: 0, sx: 0, cy: 0.5 };
    const mx = sx / sum;
    return {
      mean: sum / (w * h),
      sx: Math.sqrt(Math.max(0, sxx / sum - mx * mx)) / w, // x std-dev in uv
      cy: sy / sum / h, // dye center-of-mass y in uv (row 0 = uv y 0)
    };
  };
  // Isolate the pointer: bleed off the decayed residue, then feed simStep
  // exactly one pointer splat per frame (no audio emitters) so the field
  // contains only the trail.
  for (let i = 0; i < 120; i++) simStep(backend, fields, { dt: 1 / 60, splats: [] });
  const rest = await measure();
  for (let i = 0; i < 60; i++) {
    simStep(backend, fields, {
      dt: 1 / 60,
      splats: [{
        x: 0.2 + (i / 59) * 0.6,
        y: 0.5,
        radius: 0.05,
        vel: [0.6, 0],
        dye: [0.9, 0.6, 0.4],
      }],
    });
  }
  const swept = await measure();
  check('pointer: trail paints along the sweep', swept.sx > 0.1, `(x-spread ${swept.sx.toFixed(3)}, residue was ${rest.sx.toFixed(3)})`);
  check('pointer: trail stays on the sweep line', Math.abs(swept.cy - 0.5) < 0.18, `(dye center-y ${swept.cy.toFixed(2)}, sweep at 0.50)`);
  check('pointer: trail dominates the residue', swept.mean > rest.mean * 3, `(dye mean ${swept.mean.toFixed(3)} vs residue ${rest.mean.toFixed(3)})`);

  disp.set({
    params: {
      time: 2,
      hue: 185,
      sat: 1,
      light: 0.62,
      intensity: 1.2,
      background: [0.02, 0.024, 0.06],
    },
    src: fields.dye.read,
    src2: fields.velocity.read,
    samp: samp,
  });
  disp.draw(out);
  writePpm('smoke-pointer', await out.read(), W, H);

  out.destroy?.();
}

// ---------- Terrain (spectrum mountains) ----------
{
  console.log('\nterrain (src/visualizers/shaders/terrain.wgsl)');
  const resolved = await resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/terrain.wgsl', import.meta.url)) });
  const tgt = target(gpu, { size: [W, H] });
  const fx = effect(gpu, resolved.wgsl, { label: 'terrain' });
  const binsAt = (t, level) => Array.from({ length: 64 }, (_, i) => Math.max(0, Math.exp(-i / 14) * (0.35 + level * Math.abs(Math.sin(t * 2 + i * 0.31)))));

  fx.set({ params: audioParams(3.0), bins: binsAt(3, 0.4) });
  fx.draw(tgt);
  const quiet = await tgt.read();
  writePpm('terrain-quiet', quiet, W, H);
  const qs = stats(quiet);
  check('terrain: not blank', qs.mean > 4 && qs.litFrac > 0.02, `(mean ${qs.mean.toFixed(1)}, lit ${(qs.litFrac * 100).toFixed(0)}%)`);
  check('terrain: structured', radialSpread(quiet, W, H) > 6, `(radial spread ${radialSpread(quiet, W, H).toFixed(1)})`);

  fx.set({ params: audioParams(8.0, { bass: 0.9, mid: 0.6, treble: 0.5, beatEnergy: 1, beatTime: 0 }), bins: binsAt(8, 1) });
  fx.draw(tgt);
  const loud = await tgt.read();
  writePpm('terrain-loud', loud, W, H);
  check('terrain: loud scene differs', diffFrac(loud, quiet) > 0.05, `(${(diffFrac(loud, quiet) * 100).toFixed(0)}% pixels changed)`);
  tgt.destroy?.();
}

// ---------- Aurora (volumetric curtains) ----------
{
  console.log('\naurora (src/visualizers/shaders/aurora.wgsl)');
  const resolved = await resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/aurora.wgsl', import.meta.url)) });
  const tgt = target(gpu, { size: [W, H] });
  const fx = effect(gpu, resolved.wgsl, { label: 'aurora' });

  fx.set({ params: audioParams(3.0) });
  fx.draw(tgt);
  const quiet = await tgt.read();
  writePpm('aurora-quiet', quiet, W, H);
  const qs = stats(quiet);
  check('aurora: curtains visible', qs.mean > 4 && qs.litFrac > 0.02, `(mean ${qs.mean.toFixed(1)}, lit ${(qs.litFrac * 100).toFixed(0)}%)`);
  check('aurora: structured', radialSpread(quiet, W, H) > 6, `(radial spread ${radialSpread(quiet, W, H).toFixed(1)})`);

  fx.set({ params: audioParams(8.0, { bass: 0.9, mid: 0.6, treble: 0.5, beatEnergy: 1, beatTime: 0 }) });
  fx.draw(tgt);
  const loud = await tgt.read();
  const ls = stats(loud);
  check('aurora: loud brighter', ls.mean > qs.mean * 1.2, `(mean ${ls.mean.toFixed(1)} vs ${qs.mean.toFixed(1)})`);

  fx.set({ params: audioParams(30.0) });
  fx.draw(tgt);
  check('aurora: animated', diffFrac(await tgt.read(), quiet) > 0.05, `(${(diffFrac(await tgt.read(), quiet) * 100).toFixed(0)}% changed)`);
  tgt.destroy?.();
}

// ---------- Ridge (spectral history mountains) ----------
{
  console.log('\nridge (history + display passes)');
  const [histS, dispS] = await Promise.all([
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/waterfall-history.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/waterfall-display.wgsl', import.meta.url)) }),
  ]);
  const HW = 512;
  const HH = 64;
  const pair = { read: target(gpu, { size: [HW, HH], format: 'rgba16float' }), write: target(gpu, { size: [HW, HH], format: 'rgba16float' }) };
  const swap = () => { const t = pair.read; pair.read = pair.write; pair.write = t; };
  const fxH = effect(gpu, histS.wgsl, { label: 'ridge-history' });
  const fxD = effect(gpu, dispS.wgsl, { label: 'ridge-display' });
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  // A traveling wave over the bins: every slice of the history genuinely
  // changes from frame to frame, so a working scroll shows up as a large
  // display diff. (A sweeping pulse that runs into the exp(-i/18) treble
  // tail goes visually silent and blinds this check.)
  const binsAt = (t) => Array.from({ length: 64 }, (_, i) =>
    Math.max(0.05, (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3.0 + i * 0.45))) * Math.exp(-i / 26)));

  // Warm the history to a steady state first: the scroll only advances 2
  // texels/frame, so a fresh 512-wide texture takes ~256 frames to fill.
  // Without this, most slices still hold initial zeros and the scroll check
  // compares mostly-static flat slices.
  const scrollOnce = (i) => {
    fxH.set({ params: { ...audioParams(i / 60), resolution: [HW, HH] }, bins: binsAt(i / 60), src: pair.read, samp });
    fxH.draw(pair.write);
    swap();
  };
  for (let i = 0; i < 300; i++) scrollOnce(i);
  for (let i = 300; i < 360; i++) scrollOnce(i);
  const out = target(gpu, { size: [W, H] });
  fxD.set({ params: audioParams(1.5, { bass: 0.6, mid: 0.5, intensity: 1.2 }), src: pair.read, samp });
  fxD.draw(out);
  const frame1 = await out.read();
  writePpm('ridge-1', frame1, W, H);
  const s1 = stats(frame1);
  check('ridge: mountains visible', s1.mean > 6 && s1.litFrac > 0.03, `(mean ${s1.mean.toFixed(1)}, lit ${(s1.litFrac * 100).toFixed(0)}%)`);
  check('ridge: structured', radialSpread(frame1, W, H) > 6, `(radial spread ${radialSpread(frame1, W, H).toFixed(1)})`);

  for (let i = 360; i < 420; i++) scrollOnce(i);
  fxD.draw(out);
  const frame2 = await out.read();
  writePpm('ridge-2', frame2, W, H);
  check('ridge: history scrolls', diffFrac(frame2, frame1) > 0.05, `(${(diffFrac(frame2, frame1) * 100).toFixed(0)}% changed)`);
  out.destroy?.();
  pair.read.destroy?.();
  pair.write.destroy?.();
}

// ---------- Ripples (wave equation pond) ----------
{
  console.log('\nripples (splat + step + display passes)');
  const [splatS, stepS, dispS] = await Promise.all([
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/ripple-splat.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/ripple-step.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/ripple-display.wgsl', import.meta.url)) }),
  ]);
  const RW = 569;
  const RH = 320;
  const opts = { format: 'rgba16float' };
  const mk = () => target(gpu, { size: [RW, RH], ...opts });
  const swapPair = (pp) => { const t = pp.read; pp.read = pp.write; pp.write = t; };
  let curr = { read: mk(), write: mk() };
  let prev = { read: mk(), write: mk() };
  const fxSplat = effect(gpu, splatS.wgsl, { label: 'ripple-splat' });
  const fxStep = effect(gpu, stepS.wgsl, { label: 'ripple-step' });
  const fxD = effect(gpu, dispS.wgsl, { label: 'ripple-display' });
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  const res = () => [curr.read.size[0], curr.read.size[1]];

  for (let i = 0; i < 120; i++) {
    const p = audioParams(i / 60, { bass: 0.7, mid: 0.5, treble: 0.6, beat: i % 24 === 12, beatEnergy: i % 24 === 12 ? 1 : 0, intensity: 1.2 });
    const drops = [
      i % 24 === 12 ? [0.45, 0.5, 0.06, 0.9] : [0, 0, 0, 0],
      [Math.random(), Math.random(), 0.012, 0.5],
      [0.5 + Math.sin(i / 60 * 0.4) * 0.3, 0.5, 0.2, 0.1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    fxSplat.set({ params: { ...p, resolution: res() }, drops, src: curr.read, samp });
    fxSplat.draw(curr.write);
    swapPair(curr);
    fxStep.set({ params: { ...p, resolution: res() }, src: curr.read, src2: prev.read, samp });
    fxStep.draw(prev.write);
    swapPair(prev);
    // Role swap: prev now holds the newest field — exactly like ripples.js.
    const t = curr;
    curr = prev;
    prev = t;
  }
  const out = target(gpu, { size: [W, H] });
  fxD.set({ params: audioParams(2, { bass: 0.7, treble: 0.6, intensity: 1.2 }), src: curr.read, samp });
  fxD.draw(out);
  const rainy = await out.read();
  writePpm('ripples-rain', rainy, W, H);
  const s1 = stats(rainy);
  check('ripples: waves visible', s1.mean > 6 && s1.litFrac > 0.02, `(mean ${s1.mean.toFixed(1)}, lit ${(s1.litFrac * 100).toFixed(0)}%)`);
  check('ripples: structured', radialSpread(rainy, W, H) > 6, `(radial spread ${radialSpread(rainy, W, H).toFixed(1)})`);
  out.destroy?.();
}

// ---------- Bloom (reaction-diffusion) ----------
{
  console.log('\nbloom (seed + 12-step reaction + display)');
  const [stepS, seedS, dispS, fillS] = await Promise.all([
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/bloom-step.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/bloom-seed.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/bloom-display.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/bloom-fill.wgsl', import.meta.url)) }),
  ]);
  const BW = 512;
  const BH = 288;
  const field = { read: target(gpu, { size: [BW, BH], format: 'rgba16float' }), write: target(gpu, { size: [BW, BH], format: 'rgba16float' }) };
  const swap = () => { const t = field.read; field.read = field.write; field.write = t; };
  const fxStep = effect(gpu, stepS.wgsl, { label: 'bloom-step' });
  const fxSeed = effect(gpu, seedS.wgsl, { label: 'bloom-seed' });
  const fxD = effect(gpu, dispS.wgsl, { label: 'bloom-display' });
  const fxFill = effect(gpu, fillS.wgsl, { label: 'bloom-fill' });
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  const p = audioParams(2, { bass: 0.6, mid: 0.5, treble: 0.4, intensity: 1.2 });

  // Prime the field to A=1, B=0 — exactly what bloom.js does on creation.
  // Seeds into an all-zero (A-depleted) field burn out before nucleating.
  fxFill.draw(field.read);
  fxFill.draw(field.write);

  let snapshot1 = null;
  const out = target(gpu, { size: [W, H] });
  for (let i = 0; i < 90; i++) {
    if (i < 4 || i % 24 === 0) {
      fxSeed.set({ params: { ...p, resolution: [BW, BH] }, seed: [0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6, 0.04, 0.9], src: field.read, samp });
      fxSeed.draw(field.write);
      swap();
    }
    for (let k = 0; k < 12; k++) {
      fxStep.set({ params: { ...p, resolution: [BW, BH] }, src: field.read, samp });
      fxStep.draw(field.write);
      swap();
    }
    if (i === 12) {
      fxD.set({ params: p, src: field.read, samp });
      fxD.draw(out);
      snapshot1 = await out.read();
    }
  }
  fxD.set({ params: p, src: field.read, samp });
  fxD.draw(out);
  const final = await out.read();
  writePpm('bloom-final', final, W, H);
  const s2 = stats(final);
  const s1 = snapshot1 ? stats(snapshot1) : { litFrac: 0 };
  check('bloom: colonies visible', s2.mean > 5 && s2.litFrac > 0.03, `(mean ${s2.mean.toFixed(1)}, lit ${(s2.litFrac * 100).toFixed(0)}%)`);
  check('bloom: colonies grow', s2.litFrac > s1.litFrac * 1.2, `(lit ${(s1.litFrac * 100).toFixed(0)}% -> ${(s2.litFrac * 100).toFixed(0)}%)`);
  check('bloom: bounded', s2.max <= 255, `(max ${s2.max.toFixed(1)})`);
  out.destroy?.();
  field.read.destroy?.();
  field.write.destroy?.();
}

// ---------- Storm (compute particles + instanced streaks) ----------
{
  console.log('\nstorm (compute sim + instanced particle draw)');
  const [simS, partS, fadeS, dispS] = await Promise.all([
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/storm-compute.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/storm-particles.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/storm-fade.wgsl', import.meta.url)) }),
    resolveShader({ entry: fileURLToPath(new URL('../src/visualizers/shaders/storm-display.wgsl', import.meta.url)) }),
  ]);
  const COUNT = 80_000; // same swarm size the app ships, so brightness matches
  const buf = storage(gpu, COUNT * 16);
  const init = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    // Scatter like storm.js does — curl-noise forces are position-only, so
    // identical starting positions make the whole swarm move as one clump.
    init[i * 4] = Math.random();
    init[i * 4 + 1] = Math.random();
  }
  buf.write(init);
  const sim = compute(gpu, simS.wgsl, { label: 'storm-sim' });
  const fxFade = effect(gpu, fadeS.wgsl, { label: 'storm-fade' });
  // Instancing lives on draw() units, not effect() — same as storm.js.
  const fxPart = draw(gpu, { shader: partS.wgsl, label: 'storm-particles', instances: COUNT, vertices: 6, blend: 'additive' });
  const fxD = effect(gpu, dispS.wgsl, { label: 'storm-display' });
  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear' });
  const accum = { read: target(gpu, { size: [W, H], format: 'rgba16float' }), write: target(gpu, { size: [W, H], format: 'rgba16float' }) };
  const swap = () => { const t = accum.read; accum.read = accum.write; accum.write = t; };

  for (let i = 0; i < 40; i++) {
    const p = audioParams(i / 60, { bass: 0.8, mid: 0.5, treble: 0.5, beat: i % 24 === 12, beatEnergy: i % 24 === 12 ? 1 : 0, intensity: 1.2 });
    sim.set({ params: p, particles: buf });
    sim.dispatch(Math.ceil(COUNT / 64));
    fxFade.set({ params: p, src: accum.read, samp });
    fxFade.draw(accum.write);
    swap();
    fxPart.set({ params: p, particles: buf });
    frame(gpu, (f) => f.pass({ target: accum.read, clear: false }, fxPart));
  }

  const after = new Float32Array(await buf.read());
  let moved = 0;
  for (let i = 0; i < COUNT; i++) {
    moved += Math.hypot(after[i * 4] - init[i * 4], after[i * 4 + 1] - init[i * 4 + 1]);
  }
  check('storm: particles advected', moved / COUNT > 0.002, `(mean displacement ${(moved / COUNT).toFixed(4)})`);
  check('storm: particles on screen', moved / COUNT < 0.7, `(mean displacement ${(moved / COUNT).toFixed(4)} — bounded)`);

  const out = target(gpu, { size: [W, H] });
  fxD.set({ params: audioParams(1, { bass: 0.8, intensity: 1.2 }), src: accum.read, samp });
  fxD.draw(out);
  const px = await out.read();
  writePpm('storm-trails', px, W, H);
  const s = stats(px);
  check('storm: trails visible', s.mean > 4 && s.litFrac > 0.02, `(mean ${s.mean.toFixed(1)}, lit ${(s.litFrac * 100).toFixed(0)}%)`);
  out.destroy?.();
  accum.read.destroy?.();
  accum.write.destroy?.();
}

gpu.dispose();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll GPU visualizer checks passed.');
