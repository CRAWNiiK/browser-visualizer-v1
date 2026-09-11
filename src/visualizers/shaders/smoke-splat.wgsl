import { splatFalloff, splatDelta, SplatParams } from "./smoke-lib.wgsl";

// Adds Gaussian splats to any field: velocity (value = vx, vy) or dye
// (value = r, g, b). One shader serves both by passing a vec4 value.

@group(0) @binding(0) var<uniform> params: SplatParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var base = textureSampleLevel(src, samp, uv, 0.0);
  for (var i = 0; i < 8; i = i + 1) {
    var s = vec4f(0.0);
    var v = vec4f(0.0);
    if (i == 0) { s = params.s0; v = params.v0; }
    else if (i == 1) { s = params.s1; v = params.v1; }
    else if (i == 2) { s = params.s2; v = params.v2; }
    else if (i == 3) { s = params.s3; v = params.v3; }
    else if (i == 4) { s = params.s4; v = params.v4; }
    else if (i == 5) { s = params.s5; v = params.v5; }
    else if (i == 6) { s = params.s6; v = params.v6; }
    else { s = params.s7; v = params.v7; }
    if (i < i32(params.count) && s.w > 0.0) {
      let delta = splatDelta(uv, s.xy, params.aspect);
      let falloff = splatFalloff(delta, s.z);
      base = base + v * falloff;
    }
  }
  return base;
}
