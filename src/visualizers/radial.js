import { hs } from '../palette.js';

export default {
  id: 'radial',
  name: 'Radial Rings',
  create() {
    return {
      draw(ctx, s) {
        const cx = s.width / 2;
        const cy = s.height / 2;
        const size = Math.min(s.width, s.height);
        const base = size * 0.16;
        const maxR = size * 0.46;
        const n = s.freq.length;
        const rot = s.t * 0.15 + s.bass * 0.5;

        ctx.globalCompositeOperation = 'lighter';

        // Spectrum ring: one arc per frequency bin.
        for (let i = 0; i < n; i++) {
          const v = Math.min(s.freq[i] * (0.5 + s.intensity * 0.8), 1.2);
          const a0 = (i / n) * Math.PI * 2 + rot;
          const a1 = ((i + 1) / n) * Math.PI * 2 + rot;
          const r = base + Math.min(v, 1) * maxR;
          ctx.strokeStyle = hs(s.colors[i % s.colors.length], 0.9);
          ctx.lineWidth = 1 + v * 7;
          ctx.beginPath();
          ctx.arc(cx, cy, r, a0, a1);
          ctx.stroke();
        }

        // Inner disc pulsing with the bass and beat.
        const r = base * 0.55 + s.bass * base * 1.5 * (0.5 + s.intensity * 0.5) + s.beatEnergy * size * 0.06;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(r, 1));
        g.addColorStop(0, hs(s.colors[0], 0.35 + s.beatEnergy * 0.3));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(r, 1), 0, Math.PI * 2);
        ctx.fill();

        // Rotating spokes that lengthen with the mid band.
        ctx.strokeStyle = hs(s.colors[2], 0.25);
        ctx.lineWidth = 1;
        const spokes = 6;
        for (let i = 0; i < spokes; i++) {
          const a = rot + (i / spokes) * Math.PI * 2;
          const len = base + maxR * (0.5 + s.mid * 0.5);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
