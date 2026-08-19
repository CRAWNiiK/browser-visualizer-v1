import { hs } from '../palette.js';

export default {
  id: 'shockwave',
  name: 'Shockwave',
  create() {
    const rings = [];

    return {
      init() {
        rings.length = 0;
      },
      draw(ctx, s) {
        const cx = s.width / 2;
        const cy = s.height / 2;
        const maxR = Math.max(s.width, s.height) * 0.75;

        // Launch a ring on each beat; expansion speed scales with intensity.
        if (s.beat) {
          rings.push({
            r: 12,
            speed: (500 + s.intensity * 900) * (0.6 + s.bass),
            alpha: 1,
            width: 2 + s.intensity * 7,
          });
        }

        ctx.globalCompositeOperation = 'lighter';

        for (let i = rings.length - 1; i >= 0; i--) {
          const rg = rings[i];
          rg.r += rg.speed * s.dt;
          rg.alpha -= 1.1 * s.dt;
          if (rg.alpha <= 0 || rg.r > maxR) {
            rings.splice(i, 1);
            continue;
          }
          const col = s.colors[i % s.colors.length];
          ctx.strokeStyle = hs(col, Math.max(0, rg.alpha));
          ctx.lineWidth = Math.max(0.5, rg.width * rg.alpha);
          ctx.beginPath();
          ctx.arc(cx, cy, rg.r, 0, Math.PI * 2);
          ctx.stroke();

          // Inner echo ring.
          ctx.strokeStyle = hs(col, Math.max(0, rg.alpha * 0.4));
          ctx.lineWidth = Math.max(0.5, rg.width * rg.alpha * 0.4);
          ctx.beginPath();
          ctx.arc(cx, cy, rg.r * 0.82, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Center glow driven by the bass.
        const r = Math.max(2, 18 + s.bass * 180 * (0.4 + s.intensity * 0.6));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, hs(s.colors[0], 0.5 + s.beatEnergy * 0.4));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // Faint rotating spectrum ring for constant motion.
        const n = s.freq.length;
        const ringR = Math.min(s.width, s.height) * 0.4;
        const rot = s.t * 0.3;
        for (let i = 0; i < n; i += 2) {
          const v = s.freq[i];
          const a0 = (i / n) * Math.PI * 2 + rot;
          const a1 = ((i + 2) / n) * Math.PI * 2 + rot;
          ctx.strokeStyle = hs(s.colors[(i / 2) % s.colors.length], 0.5);
          ctx.lineWidth = 1 + v * 3;
          ctx.beginPath();
          ctx.arc(cx, cy, ringR, a0, a1);
          ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
