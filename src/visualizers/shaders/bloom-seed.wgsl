import { Params } from "./audio-params.wgsl";
import { splatFalloff, splatDelta } from "./smoke-lib.wgsl";

// "Bloom" — seed pass. On beats (and quiet lulls), the JS side drops fresh
// "food" (B) blobs so new colonies sprout; this adds one Gaussian seed.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> seed: vec4f; // x, y (uv, y up), radius, amount
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSampleLevel(src, samp, uv, 0.0).rg;
  if (seed.w > 0.0) {
    let aspect = params.resolution.x / max(params.resolution.y, 1.0);
    let delta = splatDelta(vec2f(uv.x, uv.y), vec2f(seed.x, seed.y), aspect);
    let amt = seed.w * splatFalloff(delta, seed.z);
    c.y = clamp(c.y + amt, 0.0, 1.0);
    c.x = clamp(c.x - amt * 0.5, 0.0, 1.0);
  }
  return vec4f(c, 0.0, 1.0);
}
