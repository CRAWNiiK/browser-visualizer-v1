import { Params } from "./audio-params.wgsl";
import { splatFalloff, splatDelta } from "./smoke-lib.wgsl";

// "Ripples" — splat pass. Adds raindrop splats (treble), a big beat splash,
// and slow bass swells into the height field. Height lives in channel x.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> drops: array<vec4f, 5>; // x, y (uv, y up), radius, amp
@group(0) @binding(2) var src: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var h = textureSampleLevel(src, samp, uv, 0.0).x;
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  for (var i = 0; i < 5; i = i + 1) {
    let d = drops[i];
    if (d.w != 0.0) {
      let delta = splatDelta(vec2f(uv.x, uv.y), vec2f(d.x, d.y), aspect);
      h = h + d.w * splatFalloff(delta, d.z);
    }
  }
  return vec4f(h, 0.0, 0.0, 1.0);
}
