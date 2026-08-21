import { hs } from '../palette.js';

// A triangular twist on the 3D Tunnel: a rotating wireframe of triangles that
// flies toward the camera, with a smaller offset triangle nested inside each
// ring for extra "geometry inside" depth. Neon outlines with additive blending.
export default {
  id: 'triangles',
  name: 'Triangle Tunnel',
  create() {
    const RINGS = 26;
    const SPACING = 110;
    // Three corners of an equilateral triangle.
    const CORNERS = [
      [0, -1],
      [Math.sin((2 * Math.PI) / 3), -Math.cos((2 * Math.PI) / 3)],
      [Math.sin((4 * Math.PI) / 3), -Math.cos((4 * Math.PI) / 3)],
    ];
    let zOffset = 0;
    const rings = [];

    return {
      init() {
        zOffset = 0;
        // Rings begin ahead of the camera (negative z, into the screen).
        for (let i = 0; i < RINGS; i++) rings[i] = -i * SPACING;
      },
      draw(ctx, s) {
        const cx = s.width / 2;
        const cy = s.height / 2;
        const focal = Math.max(s.width, s.height) * 1.15;
        const size = Math.min(s.width, s.height);

        // Travel speed scales with intensity, loudness, and beat spikes.
        const speed = (420 + s.intensity * 520) * (0.6 + s.level) * (1 + s.beatEnergy * 1.3);
        zOffset += speed * s.dt;

        const twist = s.t * 0.6;
        const swayX = Math.cos(s.t * 0.25) * s.width * 0.05;
        const swayY = Math.sin(s.t * 0.4) * s.height * 0.05;

        ctx.globalCompositeOperation = 'lighter';

        const frameCache = [];

        for (let i = 0; i < RINGS; i++) {
          // Recycle rings that pass the camera back to the far end.
          let z = rings[i] + zOffset;
          if (z > -20) {
            rings[i] -= RINGS * SPACING;
            z = rings[i] + zOffset;
          }
          const depth = -z;
          const scale = focal / (focal + depth);
          const r = size * 0.52 * scale * (1 + s.bass * 0.3 * s.intensity);
          const cx0 = cx + swayX * scale;
          const cy0 = cy + swayY * scale;

          // Each ring rotates and twists as it approaches.
          const rot = twist + depth * 0.0016;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          const pts = CORNERS.map(([px, py]) => [
            cx0 + r * (px * cos - py * sin),
            cy0 + r * (px * sin + py * cos),
          ]);
          frameCache.push(pts);

          const t = Math.min(1, depth / (RINGS * SPACING));
          const col = s.colors[Math.floor((1 - t) * (s.colors.length - 1))];

          // Neon triangle outline, brightening as it nears the camera.
          ctx.strokeStyle = hs(col, Math.max(0, 1 - t * 0.85));
          ctx.lineWidth = 1 + scale * 3.5;
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (let c = 1; c < pts.length; c++) ctx.lineTo(pts[c][0], pts[c][1]);
          ctx.closePath();
          ctx.stroke();

          // Nested, counter-rotating inner triangle for layered geometry.
          const inner = 0.42 * (0.8 + s.mid * 0.5);
          const icos = Math.cos(-rot * 1.7);
          const isin = Math.sin(-rot * 1.7);
          const ipts = CORNERS.map(([px, py]) => [
            cx0 + r * inner * (px * icos - py * isin),
            cy0 + r * inner * (px * isin + py * icos),
          ]);
          ctx.strokeStyle = hs(s.colors[(s.colors.length - 1) - (i % s.colors.length)], Math.max(0, 0.55 - t * 0.5));
          ctx.lineWidth = 1 + scale * 1.5;
          ctx.beginPath();
          ctx.moveTo(ipts[0][0], ipts[0][1]);
          for (let c = 1; c < ipts.length; c++) ctx.lineTo(ipts[c][0], ipts[c][1]);
          ctx.closePath();
          ctx.stroke();
        }

        // Longitudinal lines connecting consecutive rings into a wireframe mesh.
        ctx.lineWidth = 1;
        for (let c = 0; c < CORNERS.length; c++) {
          ctx.beginPath();
          for (let i = 0; i < RINGS; i++) {
            const [x, y] = frameCache[i][c];
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = hs(s.colors[c % s.colors.length], 0.22);
          ctx.stroke();
        }

        // Light at the end of the tunnel, pulsing with the bass/beat.
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.32);
        g.addColorStop(0, hs(s.colors[0], 0.4 + s.bass * 0.3 + s.beatEnergy * 0.3));
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, s.width, s.height);

        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
