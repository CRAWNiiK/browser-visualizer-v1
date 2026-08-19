import { hs } from '../palette.js';

export default {
  id: 'orb',
  name: 'Orb',
  create() {
    return {
      draw(ctx, s) {
        const cx = s.width / 2;
        const cy = s.height / 2;
        const size = Math.min(s.width, s.height);
        const baseR =
          size * 0.26 * (0.75 + s.bass * 0.5 + s.intensity * 0.15) + s.beatEnergy * size * 0.08;
        const w = s.wave;
        const n = 240; // points around the perimeter
        const amp = baseR * 0.4 * (0.3 + s.intensity * 0.7) * (0.5 + s.bass);

        ctx.globalCompositeOperation = 'lighter';

        // Trace the blob's boundary, displacing each point by the waveform.
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * 2;
          const wi = Math.floor((i / n) * w.length) % w.length;
          const wobble =
            Math.sin(a * 3 + s.t * 2.2) * baseR * 0.05 + Math.sin(a * 5 - s.t * 1.6) * baseR * 0.03;
          const r = Math.max(1, baseR + w[wi] * amp + wobble);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * 1.3);
        g.addColorStop(0, hs(s.colors[0], 0.95));
        g.addColorStop(0.45, hs(s.colors[1], 0.55));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fill();

        // Pulsing outline.
        ctx.strokeStyle = hs(s.colors[2], 0.7);
        ctx.lineWidth = 2 + s.bass * 8 + s.beatEnergy * 12;
        ctx.stroke();

        // Bright core.
        const coreR = Math.max(2, baseR * 0.35 + s.bass * baseR * 0.4);
        const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
        cg.addColorStop(0, 'rgba(255,255,255,0.9)');
        cg.addColorStop(1, 'transparent');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
