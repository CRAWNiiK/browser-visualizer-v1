import { Params } from "./audio-params.wgsl";
import { hsv2rgb } from "./lib.wgsl";
import { tonemapAces } from "@vgpu/wgsl-std/color";

// "Ridge" — display pass. Draws the spectral history as a perspective
// mountain range: each time slice is a curve over the 64 bins, slices stack
// from the front row toward the horizon, and front-to-back iteration gives
// correct occlusion. Loud moments tower; silence is a flat plain.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

const SLICES = 56.0;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var suv = uv;
  if (params.mirror > 0.5) {
    suv.x = abs(suv.x - 0.5) + 0.5;
  }

  let horizon = 0.70;
  let front = 0.14;
  let amp = (0.10 + params.bass * 0.16) * (0.5 + params.intensity * 0.6);

  var col = params.background;
  var hit = false;

  for (var s = 0.0; s < SLICES; s = s + 1.0) {
    let d = s / SLICES;                        // 0 = newest/front
    let base = mix(front, horizon, d * d * 0.9 + d * 0.1);
    if (suv.y < base - 0.002) {
      continue; // below this slice's baseline — a nearer slice will cover
    }
    // Perspective: back slices are laterally compressed toward the center.
    let spread = mix(1.0, 0.30, d);
    let lateral = clamp((suv.x - 0.5) / spread + 0.5, 0.0, 1.0);
    // History: x = age (1 = newest), y = bin. Bass on the left edge.
    let v = textureSampleLevel(src, samp, vec2f(1.0 - d, lateral), 0.0).r;
    let top = base + v * amp * (1.0 - d * 0.35);
    if (suv.y <= top) {
      let rim = 1.0 - smoothstep(0.0, 0.035, top - suv.y);
      let hue = fract(params.hue / 360.0 + (1.0 - d) * 0.10 + v * 0.12);
      let shade = (0.35 + 0.65 * (1.0 - d)) * (0.4 + v * 0.9);
      col = hsv2rgb(vec3f(hue, params.sat, params.light)) * shade
        + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.12), params.sat, 1.0)) * rim * (0.35 + params.treble * 0.5);
      hit = true;
      break;
    }
  }

  if (!hit) {
    // Sky above the range: a beat-pulsed glow on the horizon line.
    let glow = smoothstep(horizon + 0.22, horizon, suv.y)
      * (0.12 + params.beatEnergy * 0.45 + params.level * 0.25);
    col = col + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.1), params.sat, 1.0)) * glow;
  }

  col = tonemapAces(col * (0.9 + params.intensity * 0.3));
  return vec4f(col, 1.0);
}
