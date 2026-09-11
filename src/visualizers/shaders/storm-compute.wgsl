import { Params } from "./audio-params.wgsl";
import { fbmSimplex3d } from "@vgpu/wgsl-std/noise/simplex";
import { pcg2d } from "@vgpu/wgsl-std/hash";

// "Storm" — compute kernel. Each particle is a vec4 (uv position, uv/s
// velocity). The flow field is the curl of a simplex-noise potential, so
// particles swirl around invisible vortices; bass strengthens the swirl,
// beats fire a radial impulse, treble adds jitter, and a gentle center pull
// keeps the swarm on screen. Strays respawn at hashed positions.

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;

fn potential(p: vec2f) -> f32 {
  return fbmSimplex3d(vec3f(p * 3.2, params.time * 0.16), 3, 2.0, 0.5);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) {
    return;
  }
  var P = particles[i];
  let p = P.xy;

  // Curl of the noise potential via central differences.
  let e = 0.012;
  let dpx = potential(p + vec2f(e, 0.0)) - potential(p - vec2f(e, 0.0));
  let dpy = potential(p + vec2f(0.0, e)) - potential(p - vec2f(0.0, e));
  var force = vec2f(dpy, -dpx) * (2.2 + params.bass * 3.4);

  // Beat: radial shockwave out from the center.
  let toC = p - vec2f(0.5, 0.5);
  force = force + normalize(toC + vec2f(1e-5)) * params.beatEnergy * 1.5;

  // Treble: fine jitter, hashed per particle per frame.
  let r = pcg2d(vec2u(i, u32(params.time * 913.0)));
  force = force + (vec2f(f32(r.x) / 4294967295.0, f32(r.y) / 4294967295.0) - 0.5) * params.treble * 1.8;

  // Center pull scales with loudness — quiet music drifts, loud music roils.
  force = force - toC * (0.25 + params.level * 0.6);

  // Naga rejects multi-component swizzle assignment, so build the new state
  // and store the whole vec4 back in one write.
  var vel = P.zw * exp(-1.6 * params.dt) + force * params.dt;
  var pos = p + vel * params.dt;

  // Respawn strays at hashed positions.
  if (pos.x < -0.02 || pos.x > 1.02 || pos.y < -0.02 || pos.y > 1.02) {
    let r2 = pcg2d(vec2u(i * 7u + 13u, u32(params.time * 577.0)));
    pos = vec2f(f32(r2.x & 0xffffu) / 65535.0, f32(r2.y & 0xffffu) / 65535.0);
    vel = vec2f(0.0);
  }
  particles[i] = vec4f(pos, vel);
}
