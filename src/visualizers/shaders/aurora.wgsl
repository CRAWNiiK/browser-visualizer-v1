import { Params } from "./audio-params.wgsl";
import { hsv2rgb } from "./lib.wgsl";
import { tonemapAces } from "@vgpu/wgsl-std/color";
import { fbmSimplex3d } from "@vgpu/wgsl-std/noise/simplex";

// "Aurora" — raymarched volumetric light curtains. Wavy noise sheets hang
// in the sky and shimmer; bass raises the curtain line and swells the
// emission, treble adds fine shimmer, beats fire a pulse down the curtains.
// Theme hues drive the light's color ramp from base hue up to +60°.

@group(0) @binding(0) var<uniform> params: Params;

fn curtainEmission(p: vec3f) -> vec3f {
  // Curtain line: a noise-wavy height sheet the emission hangs from.
  let flow = params.time * (0.22 + params.mid * 0.35);
  let w = fbmSimplex3d(vec3f(p.x * 1.4, p.z * 1.4 + flow, flow * 0.4), 3, 2.0, 0.5);
  let line = -0.4 + w * (2.2 + params.bass * 2.4);

  // Emission hangs from the curtain line: brightest at the line, decaying
  // downward over ~2.6 units, fading out just above it. (An unbounded
  // exp(hang) above the line once saturated the entire sky.)
  let hang = p.y - line;
  let body = exp(min(hang, 0.0) * 1.4) * smoothstep(0.6, 0.0, hang) * smoothstep(-2.6, -0.2, hang);

  // Fine shimmer inside the sheet — treble makes it sparkle.
  let shimmer = fbmSimplex3d(vec3f(p.x * 5.0 + flow * 2.0, p.y * 2.5, p.z * 5.0), 3, 2.2, 0.55);
  let detail = 0.55 + 0.45 * max(shimmer, 0.0) * (1.0 + params.treble * 1.6);

  // Vertical color ramp: base hue at the bottom, +60° at the top.
  let t = clamp(0.5 - hang * 0.45, 0.0, 1.0);
  let hue = fract(params.hue / 360.0 + t * 0.16);
  return hsv2rgb(vec3f(hue, params.sat, 1.0)) * body * detail;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var suv = uv;
  if (params.mirror > 0.5) {
    suv.x = abs(suv.x - 0.5) + 0.5;
  }
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);

  // Camera looking slightly up at the sky from low on the ground.
  let ro = vec3f(0.0, 0.0, params.time * 0.4);
  let rd = normalize(vec3f((suv.x - 0.5) * 1.5 * aspect, (suv.y - 0.28) * 1.5, 1.0));

  // Volumetric march: accumulate emission with distance falloff.
  var acc = vec3f(0.0);
  var transmittance = 1.0;
  for (var i = 0; i < 36; i = i + 1) {
    let fi = f32(i);
    let t = 1.0 + fi * fi * 0.012 + fi * 0.16; // denser sampling near camera
    let p = ro + rd * t;
    if (p.y > 7.0) {
      break;
    }
    let e = curtainEmission(p);
    // Beat pulse: a brightness wave sweeping down the curtains.
    let pulse = 0.75 + 0.75 * params.beatEnergy * exp(-abs(fract(p.y * 0.35 + params.time * 1.2) - 0.5) * 4.0);
    let sampleCol = e * pulse * (0.55 + params.intensity * 0.3);
    let a = clamp(max(sampleCol.r, max(sampleCol.g, sampleCol.b)) * 0.28, 0.0, 1.0);
    acc = acc + sampleCol * transmittance * 0.32;
    transmittance = transmittance * (1.0 - a * 0.55);
    if (transmittance < 0.02) {
      break;
    }
  }

  // Ground: dark theme plane with a faint reflection of the show.
  let ground = smoothstep(0.30, 0.24, suv.y);
  let sky = params.background + acc + vec3f(0.004, 0.006, 0.012);
  let reflected = hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.05), params.sat, 1.0)) * params.level * 0.06;
  var col = mix(sky, params.background * 1.4 + reflected, ground);

  col = tonemapAces(col * (0.9 + params.intensity * 0.3));
  return vec4f(col, 1.0);
}
