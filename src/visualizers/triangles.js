import { createProgram, createQuad, hexToRgb } from '../gl-utils.js';

// A WebGL port of VVavy's "The Triangle": nested, counter-rotating neon
// triangle shells folded into a kaleidoscope, with a bass-swollen core,
// treble-driven outer lattice, and beat-fired inward/outward shockwaves.

const VERT = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uBeatEnergy;
uniform float uBeatTime;
uniform float uIntensity;
uniform float uHue;
uniform float uSat;
uniform float uLight;
uniform vec3 uBackground;
in vec2 vUv;
out vec4 outColor;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// Signed distance to an equilateral triangle (circumradius r), IQ style.
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution) * 2.0 - 1.0;
  uv.x *= uResolution.x / uResolution.y;
  float r = length(uv);
  float ang = atan(uv.y, uv.x);

  // Mids tighten the kaleidoscope: 3 folds at rest, up to 9.
  float folds = 3.0 + floor(uMid * 6.0);
  float seg = 6.2831853 / folds;
  float fa = mod(ang, seg);
  fa = abs(fa - seg * 0.5);
  vec2 p = vec2(cos(fa), sin(fa)) * r;

  float drive = 0.6 + uIntensity * 0.6;
  vec3 col = uBackground;

  // Glowing core, swelling with bass and beat energy.
  float coreR = 0.14 + uBass * 0.22 + uBeatEnergy * 0.08;
  float core = exp(-r * r / (coreR * coreR));
  col += hsv2rgb(vec3(uHue / 360.0, uSat, uLight)) * core * (0.55 + uBass * 0.5 + uBeatEnergy * 0.4);

  // Counter-rotating neon triangle shells.
  const float SHELLS = 7.0;
  for (float i = 0.0; i < SHELLS; i++) {
    float t = i / (SHELLS - 1.0);
    float dir = mod(i, 2.0) * 2.0 - 1.0;
    float rotA = dir * uTime * (0.45 + i * 0.14) * drive + t * 0.7;
    vec2 pr = rot(rotA) * p;
    float rr = 0.82 * (0.16 + t * 0.84) * (1.0 + uBass * 0.07 * (1.0 - t));
    float d = abs(sdTri(pr, rr));
    float isOuter = step(SHELLS - 1.5, i);
    float w = 0.006 + (1.0 - t) * 0.012 + isOuter * uTreble * 0.05;
    float line = 1.0 - smoothstep(0.0, w, d);
    float glow = line * (0.7 - t * 0.3);
    glow += isOuter * line * uTreble * (0.5 + 0.4 * sin(uTime * 40.0));
    col += hsv2rgb(vec3(fract(uHue / 360.0 + t * 0.18), uSat, uLight)) * glow * drive;
  }

  // Beat shockwaves: an inward collapse plus an outward bloom.
  if (uBeatTime < 1.4 && uBeatEnergy > 0.02) {
    float prog = clamp(uBeatTime, 0.0, 1.0);
    float strength = (1.0 - prog) * uBeatEnergy;
    float swR = 0.82 * (1.08 - prog * 1.08);
    float sw = 1.0 - smoothstep(0.0, 0.022, abs(sdTri(rot(uTime * 1.4) * p, swR)));
    col += hsv2rgb(vec3(fract(uHue / 360.0 + 0.5), uSat, 1.0)) * sw * strength * 2.2;
    float bloomR = 0.82 * (0.2 + prog * 0.9);
    float bl = 1.0 - smoothstep(0.0, 0.03, abs(sdTri(rot(-uTime * 1.2) * p, bloomR)));
    col += hsv2rgb(vec3(fract(uHue / 360.0 + 0.7), uSat, 1.0)) * bl * strength * 1.3;
  }

  col *= 1.0 - 0.25 * r * r;
  outColor = vec4(col, 1.0);
}`;

export default {
  id: 'triangles',
  name: 'The Triangle',
  webgl: true,
  create() {
    let gl = null;
    let quad = null;
    let prog = null;
    const u = {};
    let sinceBeat = 0;

    function init(g) {
      gl = g;
      if (!(gl instanceof WebGL2RenderingContext)) return;
      quad = createQuad(gl);
      prog = createProgram(gl, VERT, FRAG);
      const names = [
        'uResolution', 'uTime', 'uBass', 'uMid', 'uTreble', 'uBeatEnergy',
        'uBeatTime', 'uIntensity', 'uHue', 'uSat', 'uLight', 'uBackground',
      ];
      for (const n of names) u[n] = gl.getUniformLocation(prog, n);
    }

    function draw(g, s) {
      if (!prog) return;
      gl = g;
      sinceBeat = s.beat ? 0 : sinceBeat + s.dt;

      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(prog);
      gl.bindVertexArray(quad);
      gl.uniform2f(u.uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(u.uTime, s.t);
      gl.uniform1f(u.uBass, s.bass);
      gl.uniform1f(u.uMid, s.mid);
      gl.uniform1f(u.uTreble, s.treble);
      gl.uniform1f(u.uBeatEnergy, s.beatEnergy);
      gl.uniform1f(u.uBeatTime, sinceBeat);
      gl.uniform1f(u.uIntensity, s.intensity);
      const base = s.colors[0] || { h: 0, s: 100, l: 62 };
      gl.uniform1f(u.uHue, base.h);
      gl.uniform1f(u.uSat, (base.s ?? 100) / 100);
      gl.uniform1f(u.uLight, (base.l ?? 62) / 100);
      const bg = hexToRgb(s.theme.background);
      gl.uniform3f(u.uBackground, bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return { webgl: true, init, draw };
  },
};
