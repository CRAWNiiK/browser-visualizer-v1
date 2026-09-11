import { hsv2rgb } from "./lib.wgsl";
import { tonemapAces } from "@vgpu/wgsl-std/color";
import { DisplayParams } from "./smoke-lib.wgsl";

// Final composite: shades the dye field with theme colors, adds a velocity
// sheen for the iridescent-ribbon look, and tonemaps to the canvas.

@group(0) @binding(0) var<uniform> params: DisplayParams;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var src2: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let dye = textureSampleLevel(src, samp, uv, 0.0).rgb;
  let vel = textureSampleLevel(src2, samp, uv, 0.0).xy;

  let energy = max(dye.r, max(dye.g, dye.b));
  // Iridescent sheen: hue rotates with flow direction, like the classic
  // fluid-sim velocity coloring. Gated by dye density so a fading plume
  // fades to the background instead of painting raw velocity, and velocity
  // is clamped so the sheen stays a subtle tint over the dye, never a
  // full-frame light source.
  let sheenHue = fract(params.hue / 360.0 + (vel.x - vel.y) * 0.25);
  let gate = energy / (energy + 0.1);
  let sheen = hsv2rgb(vec3f(sheenHue, params.sat * 0.7, 1.0)) * min(length(vel), 1.0) * 0.12 * gate;

  var col = hsv2rgb(vec3f(fract(params.hue / 360.0 + dye.g * 0.16), params.sat, params.light)) * dye.r;
  col = col + sheen;

  // Soft bloom where dye is dense.
  col = col + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.08), params.sat, 1.0)) * energy * energy * 0.25;

  col = tonemapAces(col * (0.9 + params.intensity * 0.3));
  let bg = params.background;
  let a = clamp(max(col.r, max(col.g, col.b)) * 2.2, 0.0, 1.0);
  return vec4f(mix(bg, col, a), 1.0);
}
