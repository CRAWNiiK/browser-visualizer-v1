import { Params } from "./audio-params.wgsl";

// "Bloom" — one Gray-Scott reaction-diffusion step on a two-channel float
// field (r = A, g = B). Feed rate follows bass, kill rate follows treble,
// so the music slowly morphs the pattern language from coral to mitosis.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let e = vec2f(1.0 / params.resolution.x, 1.0 / params.resolution.y);
  let c = textureSampleLevel(src, samp, uv, 0.0).rg;
  let l = textureSampleLevel(src, samp, uv - vec2f(e.x, 0.0), 0.0).rg;
  let r = textureSampleLevel(src, samp, uv + vec2f(e.x, 0.0), 0.0).rg;
  let b = textureSampleLevel(src, samp, uv - vec2f(0.0, e.y), 0.0).rg;
  let t = textureSampleLevel(src, samp, uv + vec2f(0.0, e.y), 0.0).rg;
  let bl = textureSampleLevel(src, samp, uv - e, 0.0).rg;
  let br = textureSampleLevel(src, samp, uv + vec2f(e.x, -e.y), 0.0).rg;
  let tl = textureSampleLevel(src, samp, uv + vec2f(-e.x, e.y), 0.0).rg;
  let tr = textureSampleLevel(src, samp, uv + e, 0.0).rg;

  // Standard 9-point Laplacian weights.
  let lap = (l + r + b + t) * 0.2 + (bl + br + tl + tr) * 0.05 - c;

  // Karl Sims-style formulation: A diffuses at full strength, B at half —
  // if B spreads as fast as A, colonies can't form. f/k live in the
  // coral–mitosis band so growth is reliable; bass feeds, treble prunes.
  let f = 0.054 + params.bass * 0.006;
  let k = 0.0615 + params.treble * 0.0035;
  let ab = c.x * c.y * c.y;
  let dt = 1.0;
  let a = c.x + (lap.x - ab + f * (1.0 - c.x)) * dt;
  let bb = c.y + (lap.y * 0.5 + ab - (f + k) * c.y) * dt;
  return vec4f(clamp(a, 0.0, 1.0), clamp(bb, 0.0, 1.0), 0.0, 1.0);
}
