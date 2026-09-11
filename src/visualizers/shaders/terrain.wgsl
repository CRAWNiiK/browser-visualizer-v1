import { Params } from "./audio-params.wgsl";
import { hsv2rgb } from "./lib.wgsl";
import { tonemapAces } from "@vgpu/wgsl-std/color";
import { fbmSimplex3d } from "@vgpu/wgsl-std/noise/simplex";

// "Terrain" — a spectrum-driven mountain range you fly over. The 64-bin
// spectrum is laid out across the valley width (bass mountains near the
// center, treble foothills out wide), ridged noise gives them shape, and
// the camera streams forward — beats kick the flight speed and pulse the
// horizon glow.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<uniform> bins: array<f32, 64>;

// Which spectrum bin governs the mountains at lateral position x.
fn binAt(x: f32) -> f32 {
  let b = clamp(abs(x) / 6.0, 0.0, 0.999) * 63.0;
  let i = floor(b);
  let f = b - i;
  let lo = bins[u32(i)];
  let hi = bins[min(u32(i) + 1u, 63u)];
  return mix(lo, hi, f);
}

// Valley floor profile: deep down the middle, tall on the flanks, so the
// camera has a canyon to fly through.
fn terrainHeight(xz: vec2f, speed: f32) -> f32 {
  let z = xz.y * speed;
  let b = binAt(xz.x);
  let amp = 0.4 + b * b * 5.0 * (0.6 + params.bass * 0.8);
  // Ridged noise: sharper crests than plain fbm.
  let n = fbmSimplex3d(vec3f(xz.x * 0.55, z * 0.55, params.time * 0.1), 4, 2.1, 0.5);
  let ridge = 1.0 - abs(n * 2.0 - 1.0);
  // Valley carve toward x = 0.
  let valley = smoothstep(0.6, 3.2, abs(xz.x));
  return (ridge * amp + b * 1.5) * valley;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var p = uv;
  if (params.mirror > 0.5) {
    p.x = abs(p.x - 0.5) + 0.5;
  }
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);

  // Camera just above the valley floor, looking down the canyon.
  let kick = 1.0 + params.beatEnergy * 1.6 + params.bass * 0.6;
  let ro = vec3f(0.0, 1.1 + params.bass * 0.9, params.time * 9.0 * kick);
  let dir = normalize(vec3f((p.x - 0.5) * 1.7 * aspect, (p.y - 0.62) * 1.7, -1.6));

  // Fixed-step heightfield march.
  var t = 0.2;
  var hit = false;
  for (var i = 0; i < 72; i = i + 1) {
    let pos = ro + dir * t;
    let h = terrainHeight(pos.xz, 1.0);
    if (pos.y < h) {
      hit = true;
      break;
    }
    t = t + max(0.06, (pos.y - h) * 0.55);
    if (t > 60.0) {
      break;
    }
  }

  var col: vec3f;
  if (hit) {
    let pos = ro + dir * t;
    // Finite-difference normal, lit from the valley's leading light.
    let e = 0.12;
    let hx = terrainHeight(pos.xz + vec2f(e, 0.0), 1.0) - terrainHeight(pos.xz - vec2f(e, 0.0), 1.0);
    let hz = terrainHeight(pos.xz + vec2f(0.0, e), 1.0) - terrainHeight(pos.xz - vec2f(0.0, e), 1.0);
    let n = normalize(vec3f(-hx, 2.0 * e, -hz));
    let lightDir = normalize(vec3f(0.35, 0.8, 0.45));
    let diff = clamp(dot(n, lightDir), 0.0, 1.0);
    let fog = exp(-t * 0.055);
    let shade = 0.25 + 0.75 * diff;
    col = hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.02 + pos.y * 0.012), params.sat, params.light * shade));
    // Crest rim light — bass-driven intensity.
    col = col + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.1), params.sat, 1.0)) * pow(1.0 - n.y, 3.0) * (0.2 + params.bass * 0.5);
    col = mix(params.background * 2.0, col, fog);
  } else {
    // Sky: theme gradient with a horizon glow that pulses on beats.
    let horizon = smoothstep(0.62, 0.5, p.y);
    let glow = horizon * (0.25 + params.beatEnergy * 0.5 + params.level * 0.3);
    col = params.background
      + hsv2rgb(vec3f(fract(params.hue / 360.0 + 0.08), params.sat, 1.0)) * glow * 0.6
      + vec3f(0.02) * (1.0 - p.y);
  }

  col = tonemapAces(col * (0.85 + params.intensity * 0.35));
  return vec4f(col, 1.0);
}
