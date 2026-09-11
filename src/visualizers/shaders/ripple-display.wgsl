import { Params } from "./audio-params.wgsl";
import { hsv2rgb } from "./lib.wgsl";
import { tonemapAces } from "@vgpu/wgsl-std/color";

// "Ripples" — display pass. Shades the pond like dark water: a specular
// sun-glint from the wave normals, fresnel tint from the theme hue, and a
// faint depth glow where waves pile up.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var suv = uv;
  if (params.mirror > 0.5) {
    suv.x = abs(suv.x - 0.5) + 0.5;
  }
  let e = vec2f(1.5 / params.resolution.x, 1.5 / params.resolution.y);
  let hL = textureSampleLevel(src, samp, suv - vec2f(e.x, 0.0), 0.0).x;
  let hR = textureSampleLevel(src, samp, suv + vec2f(e.x, 0.0), 0.0).x;
  let hB = textureSampleLevel(src, samp, suv - vec2f(0.0, e.y), 0.0).x;
  let hT = textureSampleLevel(src, samp, suv + vec2f(0.0, e.y), 0.0).x;

  let n = normalize(vec3f(-(hR - hL) * 14.0, 1.0, -(hT - hB) * 14.0));
  let lightDir = normalize(vec3f(-0.4, 0.8, 0.45));
  let spec = pow(clamp(dot(reflect(-lightDir, n), vec3f(0.0, 0.0, 1.0)), 0.0, 1.0), 48.0);
  let fres = pow(1.0 - n.y, 2.0);

  var col = params.background * 1.6;
  col = col + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.06), params.sat, 1.0))
    * (0.05 + params.bass * 0.12 + clamp(hT, -1.0, 1.0) * 0.25);
  col = col + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.14), params.sat * 0.6, 1.0))
    * (spec * (0.7 + params.treble * 1.1) + fres * 0.18);

  col = tonemapAces(col * (0.9 + params.intensity * 0.35));
  return vec4f(col, 1.0);
}
