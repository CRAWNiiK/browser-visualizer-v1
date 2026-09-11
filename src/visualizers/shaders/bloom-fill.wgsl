import { Params } from "./audio-params.wgsl";

// "Bloom" — field initialization. Gray-Scott needs A≈1 everywhere (with B=0)
// before the first seeds land; a freshly created target is all zeros, and
// seeds dropped into an A-depleted field burn out before they can nucleate.

@group(0) @binding(0) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return vec4f(1.0, 0.0, 0.0, 1.0);
}
