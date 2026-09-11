import { Params } from "./audio-params.wgsl";
import { hsv2rgb } from "./lib.wgsl";

// "Storm" — instanced particle draw. A custom vertex stage builds a small
// streak quad per particle (two triangles, 6 vertices), stretched along its
// velocity so motion reads as motion; the fragment stage softens the edges.
// Rendered with additive blending into the trail accumulation target.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> particles: array<vec4f>; // xy pos, zw vel

struct VsOut {
  @builtin(position) pos: vec4f,
  @location(0) quad: vec2f,
  @location(1) tint: vec3f,
}

@vertex fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  let P = particles[ii];
  let p = P.xy;
  let v = P.zw;
  let speed = length(v);

  let ndc = vec2f(p.x * 2.0 - 1.0, 1.0 - p.y * 2.0);
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);

  // Streak orientation (uv y is flipped in NDC).
  let dirN = v / max(speed, 1e-4);
  let nd = vec2f(dirN.x, -dirN.y);
  let perp = vec2f(-nd.y, nd.x);
  let len = min(0.012 + speed * 0.02, 0.05); // uv units
  let wid = 0.0022 + params.treble * 0.0012;

  var q = vec2f(0.0);
  if (vi == 0u) { q = vec2f(-1.0, -1.0); }
  else if (vi == 1u) { q = vec2f(1.0, -1.0); }
  else if (vi == 2u) { q = vec2f(-1.0, 1.0); }
  else if (vi == 3u) { q = vec2f(1.0, -1.0); }
  else if (vi == 4u) { q = vec2f(1.0, 1.0); }
  else { q = vec2f(-1.0, 1.0); }

  let off = (nd * q.x * len + perp * q.y * wid) * vec2f(2.0 / aspect, 2.0);

  var out: VsOut;
  out.pos = vec4f(ndc + off, 0.0, 1.0);
  out.quad = q;
  let hue = fract(params.hue / 360.0 + speed * 0.09);
  // Dim, speed-weighted injection: tens of thousands of additive streaks
  // stacked over a ~14-frame trail buffer equilibrate to ~35x any single
  // frame's deposit, so per-streak brightness must stay tiny or the frame
  // washes out to white. Weighting by speed keeps the glow where the flow
  // is fast — bright streams, faint haze — instead of a uniform fog.
  out.tint = hsv2rgb(vec3f(hue, params.sat, 1.0)) * (0.003 + min(speed * 0.008, 0.028)) * (0.45 + params.intensity * 0.4);
  return out;
}

@fragment fn fs_main(in: VsOut) -> @location(0) vec4f {
  let edge = 1.0 - max(abs(in.quad.x), abs(in.quad.y));
  let a = smoothstep(0.0, 0.8, edge);
  return vec4f(in.tint * a, a);
}
