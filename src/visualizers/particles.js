import { hs } from '../palette.js';

export default {
  id: 'particles',
  name: 'Particles',
  create() {
    const particles = [];
    let spawnAcc = 0;

    return {
      init() {
        particles.length = 0;
        spawnAcc = 0;
      },
      draw(ctx, s) {
        const n = s.freq.length;
        const max = 900;

        // Fountain emission: rate scales with intensity and loudness.
        const rate = (3 + s.intensity * 12) * (0.4 + s.level * 1.8);
        spawnAcc += rate * s.dt;
        while (spawnAcc >= 1 && particles.length < max) {
          spawnAcc -= 1;
          const bin = Math.floor(Math.random() * n);
          const v = s.freq[bin];
          particles.push({
            x: ((bin + 0.5) / n) * s.width + (Math.random() - 0.5) * s.width * 0.06,
            y: s.height + 8,
            vx: (Math.random() - 0.5) * 24,
            vy: -(50 + v * 420 + Math.random() * 140) * (0.5 + s.intensity * 0.6),
            r: 1 + Math.random() * 2 + v * 3.5,
            life: 1,
            decay: 0.45 + Math.random() * 0.7,
            bin,
          });
        }

        // Radial burst on each beat.
        if (s.beat) {
          const burst = Math.round(8 + s.intensity * 14);
          for (let i = 0; i < burst && particles.length < max; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 120 + Math.random() * 320 * (0.5 + s.intensity * 0.5);
            const bin = Math.floor(Math.random() * n);
            particles.push({
              x: s.width / 2,
              y: s.height / 2,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              r: 1.5 + Math.random() * 3,
              life: 1,
              decay: 0.7 + Math.random() * 0.6,
              bin,
            });
          }
        }

        ctx.globalCompositeOperation = 'lighter';
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.x += p.vx * s.dt;
          p.y += p.vy * s.dt;
          p.vy += 60 * s.dt; // gravity pulls the fountain back down
          p.life -= p.decay * s.dt;
          if (p.life <= 0 || p.y < -24 || p.x < -24 || p.x > s.width + 24) {
            particles.splice(i, 1);
            continue;
          }
          const col = s.colors[p.bin % s.colors.length];
          ctx.fillStyle = hs(col, Math.max(0, p.life) * 0.9);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
