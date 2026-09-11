import { Params } from "./audio-params.wgsl";
import { hsv2rgb } from "./lib.wgsl";
import { tonemapAces } from "@vgpu/wgsl-std/color";

// "Bloom" — display pass. Shades the B concentration like living ink:
// pseudo-normal lighting from the field gradient gives the colonies
// relief, with a bright rim where they grow.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var suv = uv;
  if (params.mirror > 0.5) {
    suv.x = abs(suv.x - 0.5) + 0.5;
  }
  let e = vec2f(1.5 / params.resolution.x, 1.5 / params.resolution.y);
  let bL = textureSampleLevel(src, samp, suv - vec2f(e.x, 0.0), 0.0).g;
  let bR = textureSampleLevel(src, samp, suv + vec2f(e.x, 0.0), 0.0).g;
  let bB = textureSampleLevel(src, samp, suv - vec2f(0.0, e.y), 0.0).g;
  let bT = textureSampleLevel(src, samp, suv + vec2f(0.0, e.y), 0.0).g;
  let b = textureSampleLevel(src, samp, suv, 0.0).g;

  let n = normalize(vec3f((bR - bL) * 10.0, (bT - bB) * 10.0, 1.0));
  let lightDir = normalize(vec3f(-0.5, 0.6, 0.62));
  let diff = clamp(dot(n, lightDir), 0.0, 1.0);

  let ink = smoothstep(0.08, 0.45, b);
  var col = params.background;
  col = col + hsv2rgb(vec3f(fract(params.hue / 360.0 + b * 0.22), params.sat, params.light))
    * ink * (0.35 + 0.65 * diff) * (0.6 + params.intensity * 0.5);
  // Growth rim: the freshest edges of the colony glow.
  let edge = smoothstep(0.03, 0.22, b) * (1.0 - smoothstep(0.22, 0.5, b));
  col = col + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.14), params.sat, 1.0))
    * edge * (0.25 + params.beatEnergy * 0.4);

  col = tonemapAces(col * (0.9 + params.intensity * 0.3));
  return vec4f(col, 1.0);
}
