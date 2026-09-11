// Shared pure-WGSL declarations for the smoke fluid sim passes. Pure module:
// no @group/@binding, no entry points — entry shaders declare their own
// bindings using these struct types.

// Per-pass simulation parameters. Each pass only reads the fields it needs;
// unused members cost a few bytes of uniform space.
export struct SimParams {
  dt: f32,           // seconds since last frame
  texel: vec2f,      // 1/simSize of the field being differentiated
  aspect: f32,       // width/height for aspect-corrected distances
  dissipation: f32,  // exponential decay per second
  curlStrength: f32, // vorticity confinement strength
  time: f32,         // seconds since start
}

// Up to eight dye/velocity splats per frame. `sN = (x, y, radius, active)`
// in uv space (aspect-corrected distance, y pointing up), `vN = value`
// (velocity xy or dye rgb, depending on which pass binds it).
export struct SplatParams {
  count: f32,
  aspect: f32,
  s0: vec4f,
  s1: vec4f,
  s2: vec4f,
  s3: vec4f,
  s4: vec4f,
  s5: vec4f,
  s6: vec4f,
  s7: vec4f,
  v0: vec4f,
  v1: vec4f,
  v2: vec4f,
  v3: vec4f,
  v4: vec4f,
  v5: vec4f,
  v6: vec4f,
  v7: vec4f,
}

// Final display pass.
export struct DisplayParams {
  time: f32,
  hue: f32,       // theme base hue, degrees
  sat: f32,       // 0..1
  light: f32,     // 0..1
  intensity: f32, // 0..2
  background: vec3f,
}

// Gaussian splat falloff over an aspect-corrected distance.
export fn splatFalloff(delta: vec2f, radius: f32) -> f32 {
  let d2 = dot(delta, delta);
  return exp(-d2 / max(radius * radius, 1e-6));
}

// Aspect-corrected delta from a splat center to uv.
export fn splatDelta(uv: vec2f, center: vec2f, aspect: f32) -> vec2f {
  return (uv - center) * vec2f(aspect, 1.0);
}
