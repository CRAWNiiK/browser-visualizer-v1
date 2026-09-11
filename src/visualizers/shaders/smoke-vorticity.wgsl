import { SimParams } from "./smoke-lib.wgsl";

// Vorticity confinement: pushes velocity toward swirls so the smoke keeps
// curling instead of diffusing into mush.

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var src2: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let t = params.texel;
  let l = textureSampleLevel(src2, samp, uv - vec2f(t.x, 0.0), 0.0).x;
  let r = textureSampleLevel(src2, samp, uv + vec2f(t.x, 0.0), 0.0).x;
  let b = textureSampleLevel(src2, samp, uv - vec2f(0.0, t.y), 0.0).x;
  let tp = textureSampleLevel(src2, samp, uv + vec2f(0.0, t.y), 0.0).x;
  let c = textureSampleLevel(src2, samp, uv, 0.0).x;

  var force = 0.5 * vec2f(abs(tp) - abs(b), abs(r) - abs(l));
  force = force / (length(force) + 1e-4);
  force = force * params.curlStrength * c;
  force.y = force.y * -1.0;

  let vel = textureSampleLevel(src, samp, uv, 0.0).xy + force * params.dt;
  // Hard bound so confinement can never run away in pathological fields.
  let bounded = clamp(vel, vec2f(-4.0), vec2f(4.0));
  return vec4f(bounded, 0.0, 1.0);
}
