import { Params } from "./audio-params.wgsl";

// "Storm" — trail fade pass. Decays the accumulation target so particle
// streaks leave glowing wakes that cool over ~a quarter second.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let decay = exp(-4.5 * max(params.dt, 1.0 / 240.0));
  return vec4f(t * decay, 1.0);
}
