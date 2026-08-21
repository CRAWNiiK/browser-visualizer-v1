import { hs } from '../palette.js';

// Flowing neon smoke: soft glowing puffs rise from the bottom and swirl as they
// expand and fade, with additive blending for a luminous, fluid plume. Bass
// drives the buoyancy and turbulence, and each beat gusts the smoke upward.
export default {
  id: 'smoke',
  name: 'Smoke',
  create() {
    const MAX = 240;
    const puffs = [];
    let spawnAcc = 0;

    return {
      init() {
        puffs.length = 0;
        spawnAcc = 0;
      },
      draw(ctx, s) {
        // Emission rate scales with intensity and low-end energy.
        const rate = (5 + s.intensity * 22) * (0.3 + s.bass * 2.4 + s.level * 0.7);
        spawnAcc += rate * s.dt;
        while (spawnAcc >= 1 && puffs.length < MAX) {
          spawnAcc -= 1;
          this._spawn(s);
        }

        ctx.globalCompositeOperation = 'lighter';

        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          const gust = 1 + s.beatEnergy * 3 + s.bass * 2;

          // Swirling turbulence: a smooth sine drift plus a little jitter.
          p.vx += (Math.sin(s.t * p.swirl + p.phase) * 26 + (Math.random() - 0.5) * 26) * s.dt;
          p.vx *= Math.pow(0.4, s.dt); // air drag
          p.vy += (-16 - s.bass * 34 - s.beatEnergy * 60) * s.dt; // buoyancy
          p.vy *= Math.pow(0.7, s.dt);
          p.x += p.vx * s.dt;
          p.y += p.vy * s.dt;
          p.r += p.growth * s.dt * gust;
          p.life -= p.decay * s.dt;

          if (p.life <= 0 || p.y < -p.r * 2 || p.x < -p.r * 3 || p.x > s.width + p.r * 3) {
            puffs.splice(i, 1);
            continue;
          }

          const col = s.colors[p.hue];
          const a = Math.sin(Math.min(1, p.life) * Math.PI) * 0.32;
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
          g.addColorStop(0, hs(col, a));
          g.addColorStop(1, 'transparent');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.globalCompositeOperation = 'source-over';
      },

      _spawn(s) {
        // Smoke emits across the bottom, denser toward the center.
        const spread = (Math.random() + Math.random() - 1) * 0.5;
        puffs.push({
          x: s.width / 2 + spread * s.width,
          y: s.height + 10 + Math.random() * 30,
          vx: (Math.random() - 0.5) * 26,
          vy: -(24 + Math.random() * 70),
          r: 10 + Math.random() * 26 + s.bass * 26,
          growth: 16 + Math.random() * 46 + s.intensity * 24,
          life: 1,
          decay: 0.12 + Math.random() * 0.22,
          phase: Math.random() * Math.PI * 2,
          swirl: 0.6 + Math.random() * 1.4,
          hue: Math.floor(Math.random() * s.colors.length),
        });
      },
    };
  },
};
