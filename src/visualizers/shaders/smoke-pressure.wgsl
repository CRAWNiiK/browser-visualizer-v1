import { SimParams } from "./smoke-lib.wgsl";

// One Jacobi iteration of the pressure Poisson solve. Run ~20x per frame,
// ping-ponging a float target each time.

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var src2: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.texel;
  let l = textureSampleLevel(src, samp, uv - vec2f(t.x, 0.0), 0.0).x;
  let r = textureSampleLevel(src, samp, uv + vec2f(t.x, 0.0), 0.0).x;
  let b = textureSampleLevel(src, samp, uv - vec2f(0.0, t.y), 0.0).x;
  let tp = textureSampleLevel(src, samp, uv + vec2f(0.0, t.y), 0.0).x;
  let div = textureSampleLevel(src2, samp, uv, 0.0).x;
  return vec4f((l + r + b + tp - div) * 0.25, 0.0, 0.0, 1.0);
}
