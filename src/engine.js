import { spectrumToBins, bandLevel, BeatDetector } from './audio-utils.js';
import { THEMES, themeColors, hs } from './palette.js';

export const BIN_COUNT = 64;

/**
 * Runs the requestAnimationFrame loop, reads audio data from the analyser,
 * normalizes it, detects beats, and delegates drawing to the active
 * visualizer. All visualizers receive `state` — a single shared object with
 * the audio data, timing, and user settings.
 */
export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.analyser = null;
    this.freqData = null;
    this.waveData = null;
    this.feed = null; // external audio frame (e.g. from the popout window)
    this.onAudioFrame = null; // called with { bins, wave } each analysed frame
    this.beat = new BeatDetector({ threshold: 1.3, minInterval: 0.18 });
    this.viz = null;
    this.running = false;
    this.smoothing = 0.6;

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
    requestAnimationFrame((now) => this._frame(now));
  }

  stop() {
    this.running = false;
    window.removeEventListener('resize', this._resize);
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
    if (this.viz && typeof this.viz.init === 'function') this.viz.init(this.state);
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    ctx.fillStyle = s.theme.background;
    ctx.fillRect(0, 0, s.width, s.height);

    const hue = s.hueCycle ? s.hue : s.hueShift;
    s.colors = themeColors(s.theme, hue);

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
