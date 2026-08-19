import { hs } from '../palette.js';

export default {
  id: 'waveform',
  name: 'Waveform',
  create() {
    return {
      draw(ctx, s) {
        const w = s.wave;
        const n = w.length;
        const mid = s.height / 2;
        const amp =
          s.height * 0.32 * (0.35 + s.intensity * 0.65) * (0.55 + s.bass * 0.9) +
          s.beatEnergy * s.height * 0.08;
        const step = s.width / n;

        ctx.globalCompositeOperation = 'lighter';

        // Three offset layers for a neon "tube" look.
        for (let layer = 0; layer < 3; layer++) {
          const spread = (layer - 1) * 6;
          const scale = 1 - layer * 0.22;
          const alpha = 0.85 - layer * 0.25;

          ctx.beginPath();
          let prevX = 0;
          let prevY = mid + w[0] * amp * scale + spread;
          ctx.moveTo(prevX, prevY);
          for (let i = 1; i < n; i++) {
            const x = i * step;
            const y = mid + w[i] * amp * scale + spread;
            const mx = (prevX + x) / 2;
            const my = (prevY + y) / 2;
            ctx.quadraticCurveTo(prevX, prevY, mx, my);
            prevX = x;
            prevY = y;
          }
          ctx.lineTo(s.width, prevY);

          ctx.strokeStyle = hs(s.colors[layer % s.colors.length], alpha);
          ctx.lineWidth = 1.5 + layer * 1.4 + s.bass * 2;
          ctx.stroke();
        }

        // Soft glow along the center line.
        const g = ctx.createRadialGradient(s.width / 2, mid, 0, s.width / 2, mid, s.height * 0.4);
        g.addColorStop(0, hs(s.colors[0], 0.12 + s.bass * 0.12));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s.width, s.height);

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
