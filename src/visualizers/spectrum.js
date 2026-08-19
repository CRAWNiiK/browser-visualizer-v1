import { hs } from '../palette.js';

export default {
  id: 'spectrum',
  name: 'Spectrum Bars',
  create() {
    const count = 64;
    const peaks = new Float32Array(count);

    return {
      init() {
        peaks.fill(0);
      },
      draw(ctx, s) {
        const n = s.freq.length;
        const barW = s.width / n;
        const bottom = s.height;

        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < n; i++) {
          const v = Math.min(s.freq[i] * (0.5 + s.intensity * 0.75), 1.2);
          const h = Math.min(v, 1) * s.height * 0.92;
          const x = i * barW;

          // Bar body with a vertical gradient.
          const grad = ctx.createLinearGradient(0, bottom - h, 0, bottom);
          grad.addColorStop(0, hs(s.colors[i % s.colors.length], 0.95));
          grad.addColorStop(1, hs(s.colors[(i + 2) % s.colors.length], 0.15));
          ctx.fillStyle = grad;
          ctx.fillRect(x, bottom - h, barW * 0.82, h);

          // Lingering peak cap that falls slowly.
          peaks[i] = Math.max(peaks[i] - s.dt * (0.5 + s.bass * 1.5), v);
          const py = bottom - Math.min(peaks[i], 1) * s.height * 0.92;
          ctx.fillStyle = hs(s.colors[i % s.colors.length], 0.9);
          ctx.fillRect(x, py - 2, barW * 0.82, 2);
        }

        // Warm glow rising from the baseline.
        const g = ctx.createRadialGradient(s.width / 2, bottom, 0, s.width / 2, bottom, s.height * 0.5);
        g.addColorStop(0, hs(s.colors[0], 0.12 + s.bass * 0.15));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s.width, s.height);

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
