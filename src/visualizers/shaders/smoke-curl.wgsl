import { SimParams } from "./smoke-lib.wgsl";

// Curl (scalar) of the velocity field — drives vorticity confinement.

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.texel;
  let l = textureSampleLevel(src, samp, uv - vec2f(t.x, 0.0), 0.0).y;
  let r = textureSampleLevel(src, samp, uv + vec2f(t.x, 0.0), 0.0).y;
  let b = textureSampleLevel(src, samp, uv - vec2f(0.0, t.y), 0.0).x;
  let tp = textureSampleLevel(src, samp, uv + vec2f(0.0, t.y), 0.0).x;
  return vec4f(0.5 * (r - l - (tp - b)), 0.0, 0.0, 1.0);
}
