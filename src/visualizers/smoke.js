import { hs } from '../palette.js';

// A Canvas-2D homage to VVavy's "A Smoke" (itself inspired by PavelDoGreat's
// fluid simulation). A dense field of particles advects through a swirling
// curl-noise flow field, drawing short segments into a persistent trail buffer.
// The segments accumulate into flowing, iridescent ribbons whose color follows
// the direction of motion; bass feeds the plume, treble sharpens the curl, and
// each beat fires a shockwave that shoves the smoke outward.
export default {
  id: 'smoke',
  name: 'Smoke',
  create() {
    const COUNT = 1200;
    let buffer = null;
    let bctx = null;
    let particles = [];

    function seed(s) {
      particles.length = 0;
      for (let i = 0; i < COUNT; i++) {
        particles.push({ x: Math.random() * s.width, y: Math.random() * s.height });
      }
    }

    function ensureBuffer(s) {
      const w = Math.max(1, Math.round(s.width));
      const h = Math.max(1, Math.round(s.height));
      if (buffer && buffer.width === w && buffer.height === h) return;
      buffer = document.createElement('canvas');
      buffer.width = w;
      buffer.height = h;
      bctx = buffer.getContext('2d');
      seed(s);
    }

    return {
      init() {
        buffer = null;
        bctx = null;
        particles = [];
      },
      draw(ctx, s) {
        ensureBuffer(s);

        // Fade previous trails so fresh ribbons stay bright.
        bctx.globalCompositeOperation = 'destination-out';
        bctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
        bctx.fillRect(0, 0, buffer.width, buffer.height);
        bctx.globalCompositeOperation = 'lighter';

        const t = s.t;
        const cw = s.width;
        const ch = s.height;
        const base = s.colors[0];

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          const x = p.x;
          const y = p.y;

          // Layered sines produce a smooth, swirling curl-noise flow field.
          const a =
            Math.sin(x * 0.0016 + t * 0.5) * Math.cos(y * 0.0014 - t * 0.35) * 2.6 +
            Math.sin((x + y) * 0.0009 + t * 0.2) * 1.4 +
            Math.sin(y * 0.0022 - t * 0.45) * 1.1;
          let vx = Math.cos(a);
          let vy = Math.sin(a);

          // Bass lifts and energizes the plume; treble sharpens the curl.
          vy -= 0.5 + s.bass * 1.6;
          vx *= 0.7 + s.treble * 0.8;

          // Beat shockwave: push smoke outward from the center.
          if (s.beatEnergy > 0.01) {
            const dx = x - cw / 2;
            const dy = y - ch / 2;
            const d = Math.hypot(dx, dy) + 0.001;
            const f = (s.beatEnergy * 150) / (d * 0.02 + 1);
            vx += (dx / d) * f;
            vy += (dy / d) * f;
          }

          const speed = (1.2 + s.bass * 2 + s.level * 1.2) * 2.2;
          const nx = x + vx * speed;
          const ny = y + vy * speed;

          // Wrap around the field to keep the volume dense.
          p.x = nx < 0 ? cw + nx : nx > cw ? nx - cw : nx;
          p.y = ny < 0 ? ch + ny : ny > ch ? ny - ch : ny;

          // Iridescent color: hue sweeps with the direction of motion.
          const ang = Math.atan2(vy, vx);
          const hue = (base.h + ((ang + Math.PI) / (Math.PI * 2)) * 180) % 360;
          const alpha = 0.06 + s.bass * 0.05;
          bctx.strokeStyle = hs({ h: hue, s: base.s, l: base.l }, alpha);
          bctx.lineWidth = 1 + s.bass * 0.7;
          bctx.beginPath();
          bctx.moveTo(x, y);
          bctx.lineTo(p.x, p.y);
          bctx.stroke();
        }

        // Composite the accumulated smoke over the scene.
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(buffer, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },
};
