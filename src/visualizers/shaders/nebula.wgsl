import { hsv2rgb, starLayer } from "./lib.wgsl";
import { fbmSimplex3d } from "@vgpu/wgsl-std/noise/simplex";
import { tonemapAces } from "@vgpu/wgsl-std/color";
import { Params } from "./audio-params.wgsl";

@group(0) @binding(0) var<uniform> params: Params;

// Map a linear color to the theme hue ramp: hue defines the family, the
// original color's luminance drives brightness within it.
fn themeColor(baseHue: f32, color: vec3f, sat: f32, light: f32) -> vec3f {
  let lum = max(color.r, max(color.g, color.b));
  let h = fract(baseHue + (color.g - color.b) * 0.08);
  return hsv2rgb(vec3f(h, sat * 0.9, clamp(light + lum * 0.85, 0.0, 1.0)));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let res = params.resolution;
  var p = (uv * 2.0 - 1.0) * vec2f(res.x / res.y, 1.0);

  // Kaleidoscope fold when mirror mode is on.
  if (params.mirror > 0.5) {
    let a = atan2(p.y, p.x);
    let r = length(p);
    let seg = 6.2831853 / 4.0;
    let fa = abs((fract(a / seg) - 0.5) * seg);
    p = vec2f(cos(fa), sin(fa)) * r;
  }

  let intensity = params.intensity;
  let t = params.time;

  // Bass swells the cloud density, level keeps quiet passages dimmer.
  let drive = 0.35 + params.bass * 0.85 * intensity + params.level * 0.3;

  // Domain-warped fbm field, drifting slowly upward.
  let warp = vec2f(
    fbmSimplex3d(vec3f(p * 1.1, t * 0.11), 3, 2.0, 0.5),
    fbmSimplex3d(vec3f(p * 1.1 + vec2f(5.2, 1.3), t * 0.09), 3, 2.0, 0.5),
  );
  let q = p * (1.15 + params.bass * 0.25) + warp * (0.35 + params.mid * 0.45) + vec2f(0.0, -t * 0.05);
  let f = fbmSimplex3d(vec3f(q, t * 0.13), 4, 2.1, 0.55);

  // Cloud density: remap fbm into a soft band that bass can push around.
  let density = smoothstep(-0.25 - drive * 0.4, 0.65, f) * (0.55 + drive);

  // Mid-band hue drift inside the theme family.
  let hueDrift = params.mid * 0.12 + f * 0.06;
  var col = themeColor(params.hue / 360.0 + hueDrift, vec3f(f * 0.5 + 0.5), params.sat, params.light) * density;

  // Rim light where the field changes fast (billowy edges).
  let edge = 1.0 - smoothstep(0.0, 0.45, abs(fbmSimplex3d(vec3f(q * 1.7 + vec2f(t * 0.05, 0.0), t * 0.2), 2, 2.0, 0.5)));
  col += themeColor(params.hue / 360.0 + 0.08, vec3f(1.0), params.sat, 1.0) * edge * (0.12 + params.treble * 0.3);

  // Beat: lightning filaments crawling through the cloud + soft bloom.
  if (params.beatEnergy > 0.02) {
    let bolt = fbmSimplex3d(vec3f(p * 3.2, t * 2.6), 3, 2.2, 0.5);
    let filament = smoothstep(0.86 - params.beatEnergy * 0.1, 1.0, bolt);
    col += hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.55), 0.35, 1.0)) * filament * params.beatEnergy * 1.4;
    col += hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.08), params.sat, params.light)) * params.beatEnergy * 0.12;
  }

  // Treble: twinkling star layers over everything.
  let stars = starLayer(p, t, params.treble, 18.0, 0.5, 1.3) + starLayer(p * 1.9, t, params.treble, 30.0, 0.62, 7.9);
  col += vec3f(0.85, 0.9, 1.0) * stars * (0.25 + params.treble * 1.6);

  // Vignette + tonemap.
  let vig = 1.0 - 0.3 * dot(p * 0.55, p * 0.55);
  col *= vig;
  col = tonemapAces(col * (0.85 + intensity * 0.3));
  let bg = params.background;
  col = mix(bg, col, clamp(max(col.r, max(col.g, col.b)) * 2.6, 0.0, 1.0));
  return vec4f(col, 1.0);
}
