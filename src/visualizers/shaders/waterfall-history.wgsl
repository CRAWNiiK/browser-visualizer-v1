import { Params } from "./audio-params.wgsl";

// "Ridge" — history pass. Scrolls the spectral history one column left and
// writes the newest spectrum into the right edge. History texture layout:
// x = age (1.0 = newest), y = bin 0 (bass) .. 63 (treble).

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> bins: array<f32, 64>;
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // `params.resolution` here carries the HISTORY target size, not the
  // surface — the JS side overrides it when setting this pass.
  let texel = 1.0 / params.resolution.x;
  if (uv.x > 1.0 - texel * 1.5) {
    let b = clamp(floor((1.0 - uv.y) * 64.0), 0.0, 63.0);
    return vec4f(vec3f(bins[u32(b)]), 1.0);
  }
  return textureSampleLevel(src, samp, vec2f(uv.x - texel * 2.0, uv.y), 0.0);
}
