// Shared pure-WGSL helpers for the visualizer shaders. Imported modules must
// stay pure: no @group/@binding, no entry points.

import { hash2 } from "@vgpu/wgsl-std/hash";

// HSV (hue in turns 0..1, saturation, value) to linear RGB.
export fn hsv2rgb(c: vec3f) -> vec3f {
  let k = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(vec3f(c.x) + k.xyz) * 6.0 - k.www);
  return c.z * mix(vec3f(k.x), clamp(p - k.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

// Rotate a 2D vector by `a` radians.
export fn rot2d(v: vec2f, a: f32) -> vec2f {
  let c = cos(a);
  let s = sin(a);
  return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
}

// Twinkling star layer in direction space. Returns star brightness 0..n.
// `grid` scales the density, `coverage` (0..1) how many cells hold a star.
export fn starLayer(dir: vec2f, time: f32, treble: f32, grid: f32, coverage: f32, seed: f32) -> f32 {
  let sp = dir * grid + vec2f(seed * 37.0, seed * -17.0);
  let cell = floor(sp);
  let f = fract(sp) - 0.5;
  let rnd = hash2(cell + seed * 91.7);
  if (rnd.y < coverage) {
    return 0.0;
  }
  let offset = (rnd - 0.5) * 0.7;
  let d = length(f - offset);
  let twinkle = 0.55 + 0.45 * sin(time * (2.0 + rnd.x * 6.0) + rnd.y * 6.2831853) * (0.6 + treble);
  return (1.0 - smoothstep(0.0, 0.09, d)) * twinkle;
}
