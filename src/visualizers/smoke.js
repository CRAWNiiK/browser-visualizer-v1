import { createProgram, createQuad, createDoubleFBO, hslToRgb, hexToRgb, getUniform } from '../gl-utils.js';

// A WebGL2 port of the classic PavelDoGreat fluid simulation (the same effect
// VVavy's "A Smoke" credits). Dye is advected through a velocity field with
// vorticity confinement and pressure projection; audio injects dye and upward
// buoyancy so the smoke swells with the bass and bursts on each beat. The final
// pass colors the flow by its direction for the iridescent-ribbon look.

const VERT = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const SPLAT = `#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uPoint;
uniform float uRadius;
uniform vec4 uValue;
uniform vec2 uRes;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 d = vUv * uRes - uPoint;
  float falloff = exp(-dot(d, d) / (uRadius * uRadius));
  outColor = texture(uTexture, vUv) + uValue * falloff;
}`;

const CURL = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).x;
  outColor = vec4((R - L) - (T - B), 0.0, 0.0, 1.0);
}`;

const VORTICITY = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x;
  float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 vel = texture(uVelocity, vUv).xy;
  outColor = vec4(vel + force * uDt, 0.0, 1.0);
}`;

const DIVERGENCE = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uVelocity, vUv + vec2(0.0, uTexel.y)).y;
  float B = texture(uVelocity, vUv - vec2(0.0, uTexel.y)).y;
  outColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

const PRESSURE = `#version 300 es
precision highp float;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  float C = texture(uDivergence, vUv).x;
  outColor = vec4((L + R + T + B - C) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT = `#version 300 es
precision highp float;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture(uPressure, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture(uPressure, vUv - vec2(0.0, uTexel.y)).x;
  vec2 vel = texture(uVelocity, vUv).xy;
  vel -= 0.5 * vec2(R - L, T - B);
  outColor = vec4(vel, 0.0, 1.0);
}`;

const ADVECT = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * uTexel;
  vec4 result = texture(uSource, coord);
  outColor = result / (1.0 + uDissipation * uDt);
}`;

const DISPLAY = `#version 300 es
precision highp float;
uniform sampler2D uDye;
uniform sampler2D uVelocity;
uniform float uTime;
uniform vec3 uBackground;
in vec2 vUv;
out vec4 outColor;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec3 dye = texture(uDye, vUv).rgb;
  vec2 vel = texture(uVelocity, vUv).xy;
  float speed = clamp(length(vel) / 60.0, 0.0, 1.0);
  float ang = atan(vel.y, vel.x);
  float hue = ang / 6.2831853 + 0.5 + uTime * 0.02;
  vec3 ribbon = hsv2rgb(vec3(fract(hue), 0.9, 1.0)) * speed * 1.2;
  vec3 col = dye * 1.6 + ribbon * 0.55;
  col = 1.0 - exp(-col * 1.8);
  vec2 uv = vUv - 0.5;
  col *= 1.0 - 0.22 * dot(uv, uv);
  outColor = vec4(uBackground + col, 1.0);
}`;

const SIM_RES = 128;
const DYE_RES = 256;
const DENSITY_DISSIPATION = 1.0;
const VELOCITY_DISSIPATION = 0.2;
const PRESSURE_ITERATIONS = 20;
const CURL_STRENGTH = 30;
const VELOCITY_SCALE = 70; // texels/second

export default {
  id: 'smoke',
  name: 'Smoke',
  webgl: true,
  create() {
    let gl = null;
    let quad = null;
    let velocity = null;
    let dye = null;
    let pressure = null;
    let divergence = null;
    let curl = null;
    let programs = null;
    let ready = false;

    function step(target, program, bind) {
      gl.useProgram(program);
      gl.bindVertexArray(quad);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
      gl.viewport(0, 0, target.width, target.height);
      bind();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      target.swap();
    }

    function splat(target, program, nx, ny, value, radius) {
      const x = nx * target.width;
      const y = ny * target.height;
      step(target, program, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, target.read.texture);
        gl.uniform1i(program.u.uTexture, 0);
        gl.uniform2f(program.u.uPoint, x, y);
        gl.uniform1f(program.u.uRadius, radius);
        gl.uniform4f(program.u.uValue, value[0], value[1], value[2], value[3]);
        gl.uniform2f(program.u.uRes, target.width, target.height);
      });
    }

    function init(g) {
      gl = g;
      if (!(gl instanceof WebGL2RenderingContext)) {
        ready = false;
        return;
      }
      quad = createQuad(gl);

      programs = {
        splat: createProgram(gl, VERT, SPLAT),
        curl: createProgram(gl, VERT, CURL),
        vorticity: createProgram(gl, VERT, VORTICITY),
        divergence: createProgram(gl, VERT, DIVERGENCE),
        pressure: createProgram(gl, VERT, PRESSURE),
        gradient: createProgram(gl, VERT, GRADIENT),
        advect: createProgram(gl, VERT, ADVECT),
        display: createProgram(gl, VERT, DISPLAY),
      };

      const RGBA16F = gl.RGBA16F;
      const HALF = gl.HALF_FLOAT;

      velocity = createDoubleFBO(gl, SIM_RES, SIM_RES, RGBA16F, gl.RGBA, HALF, gl.LINEAR);
      dye = createDoubleFBO(gl, DYE_RES, DYE_RES, RGBA16F, gl.RGBA, HALF, gl.LINEAR);
      pressure = createDoubleFBO(gl, SIM_RES, SIM_RES, RGBA16F, gl.RGBA, HALF, gl.NEAREST);
      divergence = createDoubleFBO(gl, SIM_RES, SIM_RES, RGBA16F, gl.RGBA, HALF, gl.NEAREST);
      curl = createDoubleFBO(gl, SIM_RES, SIM_RES, RGBA16F, gl.RGBA, HALF, gl.NEAREST);

      const UNIFORMS = {
        splat: ['uTexture', 'uPoint', 'uRadius', 'uValue', 'uRes'],
        curl: ['uVelocity', 'uTexel'],
        vorticity: ['uVelocity', 'uCurl', 'uCurlStrength', 'uDt', 'uTexel'],
        divergence: ['uVelocity', 'uTexel'],
        pressure: ['uPressure', 'uDivergence', 'uTexel'],
        gradient: ['uPressure', 'uVelocity', 'uTexel'],
        advect: ['uVelocity', 'uSource', 'uDt', 'uDissipation', 'uTexel'],
        display: ['uDye', 'uVelocity', 'uTime', 'uBackground'],
      };
      for (const name of Object.keys(programs)) {
        const locs = {};
        for (const u of UNIFORMS[name]) locs[u] = getUniform(gl, programs[name], u);
        programs[name].u = locs;
      }
      ready = true;
    }

    function emit(s) {
      const base = s.colors[0] || { h: 0, s: 100, l: 70 };
      const hue = base.h;
      const level = s.level;
      const bass = s.bass;
      const velScale = VELOCITY_SCALE * (0.5 + s.intensity * 0.8);
      const amount = Math.min(1, bass * 1.4 + level * 0.5);
      const dyeScale = (0.3 + s.intensity * 0.2) * amount;

      if (amount > 0.02) {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const fx = 0.5 + 0.42 * Math.sin(s.t * 0.5 + i * 1.7 + Math.sin(s.t * 0.23 + i) * 0.6);
          const fy = 0.8 + 0.07 * Math.sin(s.t * 0.8 + i * 2.3);
          const dx = Math.sin(s.t * 0.6 + i * 2.1) * 0.5 * velScale * amount;
          const dy = -(0.5 + bass * 1.6) * velScale * amount;
          const [r, g, b] = hslToRgb(hue + i * 14, 80, 70);
          splat(dye, programs.splat, fx, fy, [r * dyeScale, g * dyeScale, b * dyeScale, 0], DYE_RES * 0.08);
          splat(velocity, programs.splat, fx, fy, [dx, dy, 0, 0], SIM_RES * 0.06);
        }
      }

      // Beat shockwave: a ring of outward shoves plus a dye burst at the center.
      if (s.beat) {
        const ring = 16;
        const r0 = 0.16;
        const sp = velScale * 5;
        for (let i = 0; i < ring; i++) {
          const a = (i / ring) * Math.PI * 2;
          splat(
            velocity,
            programs.splat,
            0.5 + Math.cos(a) * r0,
            0.5 + Math.sin(a) * r0,
            [Math.cos(a) * sp, Math.sin(a) * sp, 0, 0],
            SIM_RES * 0.05,
          );
        }
        const [r, g, b] = hslToRgb(hue + 40, 100, 70);
        splat(dye, programs.splat, 0.5, 0.5, [r * 0.6, g * 0.6, b * 0.6, 0], DYE_RES * 0.14);
      }
    }

    function draw(g, s) {
      if (!ready) return;
      gl = g;
      const dt = Math.min(s.dt, 0.05);

      emit(s);

      const vt = [1 / velocity.width, 1 / velocity.height];

      step(curl, programs.curl, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(programs.curl.u.uVelocity, 0);
        gl.uniform2f(programs.curl.u.uTexel, vt[0], vt[1]);
      });

      step(velocity, programs.vorticity, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, curl.read.texture);
        gl.uniform1i(programs.vorticity.u.uVelocity, 0);
        gl.uniform1i(programs.vorticity.u.uCurl, 1);
        gl.uniform1f(programs.vorticity.u.uCurlStrength, CURL_STRENGTH);
        gl.uniform1f(programs.vorticity.u.uDt, dt);
        gl.uniform2f(programs.vorticity.u.uTexel, vt[0], vt[1]);
      });

      step(divergence, programs.divergence, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(programs.divergence.u.uVelocity, 0);
        gl.uniform2f(programs.divergence.u.uTexel, vt[0], vt[1]);
      });

      for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
        step(pressure, programs.pressure, () => {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, divergence.read.texture);
          gl.uniform1i(programs.pressure.u.uPressure, 0);
          gl.uniform1i(programs.pressure.u.uDivergence, 1);
          gl.uniform2f(programs.pressure.u.uTexel, vt[0], vt[1]);
        });
      }

      step(velocity, programs.gradient, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(programs.gradient.u.uPressure, 0);
        gl.uniform1i(programs.gradient.u.uVelocity, 1);
        gl.uniform2f(programs.gradient.u.uTexel, vt[0], vt[1]);
      });

      step(velocity, programs.advect, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(programs.advect.u.uVelocity, 0);
        gl.uniform1i(programs.advect.u.uSource, 1);
        gl.uniform1f(programs.advect.u.uDt, dt);
        gl.uniform1f(programs.advect.u.uDissipation, VELOCITY_DISSIPATION);
        gl.uniform2f(programs.advect.u.uTexel, vt[0], vt[1]);
      });

      const dtk = [1 / dye.width, 1 / dye.height];
      step(dye, programs.advect, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, dye.read.texture);
        gl.uniform1i(programs.advect.u.uVelocity, 0);
        gl.uniform1i(programs.advect.u.uSource, 1);
        gl.uniform1f(programs.advect.u.uDt, dt);
        gl.uniform1f(programs.advect.u.uDissipation, DENSITY_DISSIPATION);
        gl.uniform2f(programs.advect.u.uTexel, dtk[0], dtk[1]);
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(programs.display);
      gl.bindVertexArray(quad);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dye.read.texture);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
      gl.uniform1i(programs.display.u.uDye, 0);
      gl.uniform1i(programs.display.u.uVelocity, 1);
      gl.uniform1f(programs.display.u.uTime, s.t);
      const bg = hexToRgb(s.theme.background);
      gl.uniform3f(programs.display.u.uBackground, bg[0], bg[1], bg[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    return { init, draw };
  },
};
