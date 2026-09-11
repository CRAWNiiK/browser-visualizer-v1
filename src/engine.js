import { spectrumToBins, bandLevel, BeatDetector } from './audio-utils.js';
import { THEMES, themeColors, hs } from './palette.js';
import { setGpuCanvas } from './gpu.js';

export const BIN_COUNT = 64;

/**
 * Runs the requestAnimationFrame loop, reads audio data from the analyser,
 * normalizes it, detects beats, and delegates drawing to the active
 * visualizer. All visualizers receive `state` — a single shared object with
 * the audio data, timing, and user settings.
 */
export class Engine {
  constructor(canvas, gpuCanvas = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gpuCanvas = gpuCanvas; // WebGPU target for visualizers with `webgpu: true`
    this.isGPU = false;
    this._gpuShown = false;
    if (gpuCanvas) setGpuCanvas(gpuCanvas); // register with the shared vgpu runtime
    this.analyser = null;
    this.freqData = null;
    this.waveData = null;
    this.feed = null; // external audio frame (e.g. from the popout window)
    this.onAudioFrame = null; // called with { bins, wave } each analysed frame
    this.beat = new BeatDetector({ threshold: 1.3, minInterval: 0.18 });
    this.viz = null;
    this.running = false;
    this.smoothing = 0.6;

    // Pointer trail input for visualizers that paint with it (smoke). Stored
    // in vgpu effect uv space, where y=0 is the BOTTOM of the canvas and y
    // grows upward; conversion from DOM coordinates happens per move event.
    this.pointer = {
      x: 0.5, // uv, 0..1 left→right
      y: 0.5, // uv, 0..1 bottom→top
      vx: 0, // uv/second, smoothed
      vy: 0,
      active: false, // true only on frames where the pointer moved
      _event: null, // latest pointermove payload
      _hasPos: false, // seen a move since the last (re)entry
      _moved: false, // a move arrived since the last drawn frame
    };

    this.state = {
      width: 0,
      height: 0,
      dpr: 1,
      t: 0, // seconds since start
      dt: 0, // seconds since last frame
      freq: new Float32Array(BIN_COUNT), // normalized log-spaced spectrum, 0..1
      wave: new Float32Array(2048), // normalized time-domain samples, -1..1
      level: 0, // overall loudness, 0..1 (smoothed)
      bass: 0, // low band, 0..1 (smoothed)
      mid: 0, // mid band, 0..1 (smoothed)
      treble: 0, // high band, 0..1 (smoothed)
      beat: false, // true the frame a beat fires
      beatEnergy: 0, // 1 right after a beat, decays to 0
      intensity: 1, // 0..2 from the slider
      hueShift: 0, // manual hue slider, 0..360
      hue: 0, // auto-cycling hue
      hueCycle: false,
      theme: THEMES[0],
      colors: themeColors(THEMES[0]),
      mirror: false,
      flash: false, // safe-flash mode reduces strobe intensity
      pointer: this.pointer, // pointer trail for visualizers that paint with it
      paused: false,
      fps: 0,
    };

    this._last = performance.now();
    this._fpsAcc = 0;
    this._fpsLast = this._last;
    this._resize = this._resize.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this._resize();
    window.addEventListener('resize', this._resize);
    this._bindPointer();
    requestAnimationFrame((now) => this._frame(now));
  }

  stop() {
    this.running = false;
    window.removeEventListener('resize', this._resize);
    if (this._pointerBound) {
      for (const el of [this.canvas, this.gpuCanvas]) {
        if (!el) continue;
        el.removeEventListener('pointermove', this._onPointerMove);
        el.removeEventListener('pointerleave', this._onPointerLeave);
      }
      this._pointerBound = false;
    }
  }

  _bindPointer() {
    if (this._pointerBound) return;
    this._pointerBound = true;
    this._onPointerMove = (e) => {
      // UI overlays sit above the canvas, so moves over them never reach
      // here — the trail only paints where the canvas is directly hovered.
      const rect = e.currentTarget.getBoundingClientRect();
      this.pointer._event = { x: e.clientX, y: e.clientY, rect };
      this.pointer._moved = true;
    };
    this._onPointerLeave = () => {
      // Forget the last position so re-entry doesn't fling a splat across
      // the whole screen.
      this.pointer._event = null;
      this.pointer._hasPos = false;
      this.pointer._moved = false;
    };
    for (const el of [this.canvas, this.gpuCanvas]) {
      if (!el) continue;
      el.addEventListener('pointermove', this._onPointerMove);
      el.addEventListener('pointerleave', this._onPointerLeave);
    }
  }

  /**
   * Consume the accumulated pointer events and turn them into per-frame uv
   * position + smoothed velocity on the shared state. Runs every frame;
   * `active` is only true when the pointer actually moved since last frame.
   */
  _updatePointer(dt) {
    const p = this.pointer;
    if (p._moved && p._event) {
      const { x, y, rect } = p._event;
      const nx = (x - rect.left) / rect.width;
      const ny = 1 - (y - rect.top) / rect.height; // uv y points up
      if (p._hasPos) {
        const inv = 1 / Math.max(dt, 1 / 240);
        p.vx += ((nx - p.x) * inv - p.vx) * 0.55;
        p.vy += ((ny - p.y) * inv - p.vy) * 0.55;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
      p.x = nx;
      p.y = ny;
      p._hasPos = true;
      p.active = true;
      p._moved = false;
    } else {
      p.active = false;
      p.vx = 0;
      p.vy = 0;
    }
  }

  setAnalyser(analyser) {
    this.analyser = analyser;
    if (analyser) {
      this.freqData = new Uint8Array(analyser.frequencyBinCount);
      this.waveData = new Uint8Array(analyser.fftSize);
      analyser.smoothingTimeConstant = this.smoothing;
      this.state.wave = new Float32Array(analyser.fftSize);
    } else {
      this.freqData = null;
      this.waveData = null;
      this.state.freq.fill(0);
      this.state.wave.fill(0);
      this.state.level = 0;
      this.state.bass = 0;
      this.state.mid = 0;
      this.state.treble = 0;
    }
  }

  setSmoothing(v) {
    this.smoothing = v;
    if (this.analyser) this.analyser.smoothingTimeConstant = v;
  }

  /**
   * Provide audio as an external feed ({ bins, wave }) instead of reading an
   * analyser directly. Used by the popout window, which receives analysed
   * frames from the main window over postMessage.
   */
  setAudioFeed(feed) {
    this.feed = feed;
    if (this.state.wave.length !== feed.wave.length) {
      this.state.wave = new Float32Array(feed.wave.length);
    }
  }

  clearAudioFeed() {
    this.feed = null;
    this.state.freq.fill(0);
    this.state.wave.fill(0);
    this.state.level = 0;
    this.state.bass = 0;
    this.state.mid = 0;
    this.state.treble = 0;
  }

  setVisualizer(create) {
    this.viz = create();
    this.isGPU = !!(this.viz && this.viz.webgpu);
    this._gpuShown = false;
    if (this.viz && typeof this.viz.init === 'function') {
      try {
        // GPU visualizers initialize async (WebGPU device acquisition); a
        // rejection must never take down the loop. While a GPU visualizer is
        // not ready yet, the engine draws the theme background + a hint.
        Promise.resolve(this.viz.init(this.state)).catch((err) => {
          console.error('Visualizer init failed:', err);
        });
      } catch (err) {
        // A shader compile error must never take down the whole app.
        console.error('Visualizer init failed:', err);
      }
    }
    this._syncCanvasVisibility();
  }

  _syncCanvasVisibility() {
    // The GPU canvas shows as soon as a GPU visualizer is selected — the
    // vgpu surface needs a visible canvas to size itself — and stays until
    // init reports it can't get a device; then the 2D canvas carries the
    // background and the explanatory hint.
    const useGPU = this.isGPU && !!this.gpuCanvas && !!(this.viz && !this.viz.unsupported);
    if (this.gpuCanvas) this.gpuCanvas.style.display = useGPU ? 'block' : 'none';
    if (this.canvas) this.canvas.style.display = useGPU ? 'none' : 'block';
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The WebGPU canvas is sized by vgpu's surface (dpr clamped to [1, 2]).
    Object.assign(this.state, { width: w, height: h, dpr });
  }

  _frame(now) {
    if (!this.running) return;
    const dt = Math.min((now - this._last) / 1000, 0.05);
    this._last = now;

    this._fpsAcc += 1;
    if (now - this._fpsLast >= 1000) {
      this.state.fps = this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsLast = now;
    }

    if (!this.state.paused) {
      this.state.t += dt;
      this.state.dt = dt;
      this._readAudio();
      this._updateBeat(dt);
      this._updatePointer(dt);
      this._draw();
    }

    requestAnimationFrame((t) => this._frame(t));
  }

  _readAudio() {
    const s = this.state;

    // An external feed (e.g. the popout window) takes priority over reading
    // an analyser directly.
    if (this.feed) {
      s.freq.set(this.feed.bins);
      s.wave.set(this.feed.wave);
      const k = 0.4;
      const rawBass = bandLevel(s.freq, 0, 8);
      const rawMid = bandLevel(s.freq, 8, 28);
      const rawTreble = bandLevel(s.freq, 28, BIN_COUNT);
      s.bass += (rawBass - s.bass) * k;
      s.mid += (rawMid - s.mid) * k;
      s.treble += (rawTreble - s.treble) * k;
      s.level += (Math.min(1, s.bass * 0.5 + s.mid * 0.3 + s.treble * 0.2) - s.level) * k;
      return;
    }

    if (!this.analyser || !this.freqData || !this.waveData) {
      s.freq.fill(0);
      s.wave.fill(0);
      s.level = 0;
      s.bass = 0;
      s.mid = 0;
      s.treble = 0;
      return;
    }

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.waveData);

    const bins = spectrumToBins(
      this.freqData,
      BIN_COUNT,
      this.analyser.context.sampleRate,
      this.analyser.fftSize,
    );
    s.freq.set(bins);

    for (let i = 0; i < s.wave.length; i++) {
      s.wave[i] = this.waveData[i] / 128 - 1;
    }

    // Light exponential smoothing on the bands for steadier visuals.
    const k = 0.4;
    const rawBass = bandLevel(bins, 0, 8);
    const rawMid = bandLevel(bins, 8, 28);
    const rawTreble = bandLevel(bins, 28, BIN_COUNT);
    s.bass += (rawBass - s.bass) * k;
    s.mid += (rawMid - s.mid) * k;
    s.treble += (rawTreble - s.treble) * k;
    s.level += (Math.min(1, s.bass * 0.5 + s.mid * 0.3 + s.treble * 0.2) - s.level) * k;

    // Notify listeners (e.g. to forward the frame to a popout window).
    if (this.onAudioFrame) this.onAudioFrame({ bins: s.freq, wave: s.wave });
  }

  _updateBeat(dt) {
    const s = this.state;
    s.beat = this.beat.update(s.bass, dt);
    s.beatEnergy *= Math.pow(0.001, dt); // exponential decay toward 0
    if (s.beat) s.beatEnergy = 1;
    if (s.hueCycle) s.hue = (s.hue + dt * 25) % 360;
  }

  _draw() {
    const s = this.state;
    const { ctx } = this;

    const hue = s.hueCycle ? s.hue : s.hueShift;
    s.colors = themeColors(s.theme, hue);

    if (this.isGPU) {
      // vgpu visualizers render straight into #gpucanvas; they only expose
      // draw() once async init has completed. Flip canvas visibility the
      // frame that flips (init resolves or the next visualizer is selected).
      const gpuReady = !!(this.viz && this.viz.ready && this.gpuCanvas);
      if (gpuReady !== this._gpuShown) {
        this._gpuShown = gpuReady;
        this._syncCanvasVisibility();
      }
      if (gpuReady) {
        this.viz.draw(null, s);
      } else {
        ctx.fillStyle = s.theme.background;
        ctx.fillRect(0, 0, s.width, s.height);
        if (this.viz && this.viz.unsupported) {
          // Init couldn't get a WebGPU device: explain why it's dark.
          ctx.fillStyle = 'rgba(231, 236, 245, 0.85)';
          ctx.font = '500 15px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(
            'This visualizer needs WebGPU — try Chrome, Edge, or the latest Firefox/Safari.',
            s.width / 2,
            s.height / 2,
          );
        }
      }
      return;
    }

    ctx.fillStyle = s.theme.background;
    ctx.fillRect(0, 0, s.width, s.height);

    if (this.viz) {
      const drawViz = () => this.viz.draw(ctx, s);
      if (s.mirror) {
        // Draw once, then a horizontally-flipped copy for a kaleidoscope effect.
        drawViz();
        ctx.save();
        ctx.translate(s.width, 0);
        ctx.scale(-1, 1);
        drawViz();
        ctx.restore();
      } else {
        drawViz();
      }
    }

    // Subtle full-screen flash on each beat (skipped in safe-flash mode).
    if (s.beatEnergy > 0.02 && !s.flash) {
      const a = s.beatEnergy * 0.06 * (0.5 + s.intensity * 0.5);
      const grd = ctx.createRadialGradient(
        s.width / 2, s.height / 2, 0,
        s.width / 2, s.height / 2, Math.max(s.width, s.height) * 0.6,
      );
      grd.addColorStop(0, hs(s.colors[0], a));
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, s.width, s.height);
    }
  }
}
