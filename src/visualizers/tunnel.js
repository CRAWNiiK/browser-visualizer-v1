import { hs } from '../palette.js';

export default {
  id: 'tunnel',
  name: '3D Tunnel',
  create() {
    const RINGS = 24;
    const SPACING = 120;
    const CORNERS = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    let zOffset = 0;
    const rings = [];

    return {
      init() {
        zOffset = 0;
        // Rings start ahead of the camera (negative z, into the screen) and
        // travel toward it as zOffset grows.
        for (let i = 0; i < RINGS; i++) rings[i] = -i * SPACING;
      },
      draw(ctx, s) {
        const cx = s.width / 2;
        const cy = s.height / 2;
        const focal = Math.max(s.width, s.height) * 1.1;
        const size = Math.min(s.width, s.height);

        // Travel speed scales with intensity, loudness, and beat spikes.
        const speed = (400 + s.intensity * 500) * (0.6 + s.level) * (1 + s.beatEnergy * 1.2);
        zOffset += speed * s.dt;

        const twist = s.t * 0.25;
        const swayX = Math.cos(s.t * 0.2) * s.width * 0.04;
        const swayY = Math.sin(s.t * 0.35) * s.height * 0.04;

        ctx.globalCompositeOperation = 'lighter';

        const cornerCache = [];

        for (let i = 0; i < RINGS; i++) {
          // z grows toward 0 as the ring approaches the camera, then goes
          // positive once it passes. Negative z = into the screen.
          let z = rings[i] + zOffset;
          if (z > -20) {
            // Ring reached/passed the camera — recycle it to the far end.
            rings[i] -= RINGS * SPACING;
            z = rings[i] + zOffset;
          }
          const depth = -z;
          const scale = focal / (focal + depth);
          const r = size * 0.5 * scale * (1 + s.bass * 0.25 * s.intensity);
          const cx0 = cx + swayX * scale;
          const cy0 = cy + swayY * scale;

          const rot = twist + depth * 0.0012;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const pts = CORNERS.map(([px, py]) => [
            cx0 + r * (px * cos - py * sin),
            cy0 + r * (px * sin + py * cos),
          ]);
          cornerCache.push(pts);

          // Ring outline, fading with depth.
          const t = Math.min(1, depth / (RINGS * SPACING));
          const col = s.colors[Math.floor((1 - t) * (s.colors.length - 1))];
          ctx.strokeStyle = hs(col, Math.max(0, 1 - t * 0.9));
          ctx.lineWidth = 1 + scale * 3;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let c = 1; c < pts.length; c++) ctx.lineTo(pts[c][0], pts[c][1]);
          ctx.closePath();
          ctx.stroke();
        }

        // Longitudinal lines connecting consecutive rings (wireframe grid).
        ctx.lineWidth = 1;
        for (let c = 0; c < CORNERS.length; c++) {
          ctx.beginPath();
          for (let i = 0; i < RINGS; i++) {
            const [x, y] = cornerCache[i][c];
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = hs(s.colors[c % s.colors.length], 0.22);
          ctx.stroke();
        }

        // Light at the end of the tunnel, pulsing with the bass/beat.
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.3);
        g.addColorStop(0, hs(s.colors[0], 0.35 + s.bass * 0.3 + s.beatEnergy * 0.3));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s.width, s.height);

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
