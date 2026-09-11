import { Params } from "./audio-params.wgsl";
import { tonemapAces } from "@vgpu/wgsl-std/color";

// "Storm" — display pass. Fades and tints the additive particle trails,
// applies a soft bloom on the hot cores, and hands the theme background
// back where nothing has passed.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var suv = uv;
  if (params.mirror > 0.5) {
    suv.x = abs(suv.x - 0.5) + 0.5;
  }
  let t = textureSampleLevel(src, samp, suv, 0.0).rgb;
  // Soft bloom: bright cores bleed (cheap 4-tap wide sample).
  let wide = 6.0 / params.resolution.x;
  let halo =
    textureSampleLevel(src, samp, suv + vec2f(wide, 0.0), 0.0).rgb +
    textureSampleLevel(src, samp, suv - vec2f(wide, 0.0), 0.0).rgb +
    textureSampleLevel(src, samp, suv + vec2f(0.0, wide), 0.0).rgb +
    textureSampleLevel(src, samp, suv - vec2f(0.0, wide), 0.0).rgb;

  var col = params.background + t + halo * 0.08 * (0.5 + params.level);
  col = tonemapAces(col * (0.9 + params.intensity * 0.35));
  return vec4f(col, 1.0);
}
