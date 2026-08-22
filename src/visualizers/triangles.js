import { hs } from '../palette.js';

// A Canvas-2D homage to VVavy's "The Triangle": nested neon triangle shells
// that counter-rotate around a glowing core, folded into a kaleidoscope.
// Bass swells the core, mids tighten the kaleidoscope (more mirror folds),
// treble electrifies the outer lattice, and beats fire inward shockwaves.
export default {
  id: 'triangles',
  name: 'The Triangle',
  create() {
    const SHELLS = 7;
    const shocks = [];

    return {
      init() {
        shocks.length = 0;
      },
      draw(ctx, s) {
        const cx = s.width / 2;
        const cy = s.height / 2;
        const R = Math.min(s.width, s.height) * 0.42;
        const { bass, mid, treble } = s;

        // Mids tighten the kaleidoscope: 3 folds at rest, up to 9 when loud.
        const folds = 3 + Math.round(mid * 6);

        ctx.globalCompositeOperation = 'lighter';

        // Glowing core, swelling with bass and beat energy.
        const coreR = R * (0.1 + bass * 0.24 + s.beatEnergy * 0.08);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 3.2);
        g.addColorStop(0, hs(s.colors[0], 0.55 + bass * 0.35 + s.beatEnergy * 0.3));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(cx - coreR * 3.2, cy - coreR * 3.2, coreR * 6.4, coreR * 6.4);

        // Collect shockwaves once, drawn in every fold for a kaleidoscope bloom.
        if (s.beat) {
          shocks.push({ r: R * 0.25, dir: 1, life: 1 });   // outward bloom from the core
          shocks.push({ r: R * 1.08, dir: -1, life: 1 });  // inward shockwave from outside
        }

        for (let f = 0; f < folds; f++) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate((f / folds) * Math.PI * 2);

          for (let i = 0; i < SHELLS; i++) {
            const t = i / (SHELLS - 1);
            // Alternate rotation direction: counter-rotating shells.
            const dir = i % 2 === 0 ? 1 : -1;
            const rot = dir * s.t * (0.45 + i * 0.14) + t * 0.7;
            // Bass swells the inner shells most.
            const rr = R * (0.16 + t * 0.84) * (1 + bass * 0.07 * (1 - t));
            const col = s.colors[i % s.colors.length];
            // Treble electrifies the outermost lattice.
            const outer = i === SHELLS - 1;
            const alpha = Math.min(1, 0.72 - t * 0.3 + (outer ? treble * 0.5 : 0));
            ctx.strokeStyle = hs(col, alpha);
            ctx.lineWidth = 1 + (1 - t) * 1.6 + (outer ? treble * 3.5 : 0);
            trianglePath(ctx, rr, rot);
            ctx.stroke();
          }

          // Shockwaves travel as neon triangle outlines.
          for (let i = shocks.length - 1; i >= 0; i--) {
            const sh = shocks[i];
            sh.life -= s.dt * 1.15;
            sh.r += sh.dir * R * 1.15 * s.dt;
            if (sh.life <= 0) {
              shocks.splice(i, 1);
              continue;
            }
            const a = Math.max(0, sh.life) * 0.55;
            ctx.strokeStyle = hs(s.colors[0], a);
            ctx.lineWidth = 1 + sh.life * 3;
            trianglePath(ctx, sh.r, s.t * 1.4);
            ctx.stroke();
          }

          ctx.restore();
        }

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};

// Stroke an equilateral triangle centered at the origin with circumradius r.
function trianglePath(ctx, r, rot) {
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = rot - Math.PI / 2 + (k / 3) * Math.PI * 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (k === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
