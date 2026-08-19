import { hs } from '../palette.js';

export default {
  id: 'starfield',
  name: 'Starfield',
  create() {
    const COUNT = 300;
    const stars = [];
    let speed = 0.3;

    return {
      init() {
        stars.length = 0;
        for (let i = 0; i < COUNT; i++) {
          stars.push({
            x: (Math.random() - 0.5) * 2,
            y: (Math.random() - 0.5) * 2,
            z: Math.random(),
            px: null,
            py: null,
          });
        }
        speed = 0.3;
      },
      draw(ctx, s) {
        // Warp speed: cruising speed + intensity + bass, spiked by beats.
        const target = (0.15 + s.intensity * 0.25 + s.bass * 0.5) * (1 + s.beatEnergy * 3);
        speed += (target - speed) * 0.1;

        const cx = s.width / 2;
        const cy = s.height / 2;
        const k = Math.min(s.width, s.height) * 0.9;

        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < stars.length; i++) {
          const st = stars[i];
          st.z -= speed * s.dt;
          if (st.z <= 0.02) {
            st.x = (Math.random() - 0.5) * 2;
            st.y = (Math.random() - 0.5) * 2;
            st.z = 1;
            st.px = null;
            st.py = null;
          }

          const inv = 1 / st.z;
          const sx = cx + st.x * k * inv * 0.5;
          const sy = cy + st.y * k * inv * 0.5;
          const offscreen = sx < -200 || sx > s.width + 200 || sy < -200 || sy > s.height + 200;

          const alpha = Math.min(1, 1.6 - st.z) * (0.5 + s.level * 0.5);
          const colIdx = Math.min(s.colors.length - 1, Math.floor((1 - st.z) * s.colors.length));
          const col = s.colors[colIdx];
          const size = 0.8 + inv * 1.4;

          if (st.px === null || offscreen) {
            // No previous position (fresh star) or off-screen: draw a dot.
            if (!offscreen) {
              ctx.fillStyle = hs(col, alpha);
              ctx.beginPath();
              ctx.arc(sx, sy, size, 0, Math.PI * 2);
              ctx.fill();
            }
            st.px = sx;
            st.py = sy;
            continue;
          }

          // Streak from the previous frame's position — long when warping.
          ctx.strokeStyle = hs(col, alpha);
          ctx.lineWidth = size;
          ctx.beginPath();
          ctx.moveTo(st.px, st.py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          st.px = sx;
          st.py = sy;
        }

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
