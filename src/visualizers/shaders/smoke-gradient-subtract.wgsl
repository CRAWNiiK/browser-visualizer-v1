import { SimParams } from "./smoke-lib.wgsl";

// Subtract the pressure gradient from velocity, making the field
// divergence-free (incompressible flow).

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
  let vel = textureSampleLevel(src2, samp, uv, 0.0).xy;
  return vec4f(vel - 0.5 * vec2f(r - l, tp - b), 0.0, 1.0);
}
