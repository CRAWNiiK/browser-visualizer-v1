import { SimParams } from "./smoke-lib.wgsl";

// Semi-Lagrangian advection: each texel looks backward along the velocity
// field and copies the value it was carried from. Works for both velocity
// (self-advection) and dye. Dissipation decays the field exponentially.

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var src2: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vel = textureSampleLevel(src, samp, uv, 0.0).xy;
  // Velocity is in uv units per second; step back along it.
  let back = uv - vel * params.dt;
  let carried = textureSampleLevel(src2, samp, back, 0.0);
  let decay = exp(-params.dissipation * params.dt);
  return carried * decay;
}
