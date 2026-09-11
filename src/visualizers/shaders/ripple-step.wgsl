import { Params } from "./audio-params.wgsl";

// "Ripples" — one step of the 2D wave equation on a height field.
// next = 0.5 * laplacian(curr) - prev, damped. `src` is the current field,
// `src2` the previous one; the result lands in the previous slot, then the
// JS side swaps the two buffers' roles.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var src2: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let e = vec2f(1.0 / params.resolution.x, 1.0 / params.resolution.y);
  let c = textureSampleLevel(src, samp, uv, 0.0).x;
  let l = textureSampleLevel(src, samp, uv - vec2f(e.x, 0.0), 0.0).x;
  let r = textureSampleLevel(src, samp, uv + vec2f(e.x, 0.0), 0.0).x;
  let b = textureSampleLevel(src, samp, uv - vec2f(0.0, e.y), 0.0).x;
  let t = textureSampleLevel(src, samp, uv + vec2f(0.0, e.y), 0.0).x;
  let prev = textureSampleLevel(src2, samp, uv, 0.0).x;
  var next = (l + r + b + t) * 0.5 - prev;
  next = next * 0.988; // damping — without it the pond never calms
  return vec4f(next, 0.0, 0.0, 1.0);
}
