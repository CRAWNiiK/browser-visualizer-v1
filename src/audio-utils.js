// Pure audio-analysis helpers (no DOM/Web Audio dependencies) so they can be
// unit-tested in isolation.

/**
 * Map raw byte frequency data (0–255 per FFT bin, from
 * AnalyserNode.getByteFrequencyData) into `count` normalized 0–1 bins that are
 * spaced logarithmically across the audible range. Human hearing is roughly
 * logarithmic, so this gives low frequencies as much visual weight as highs.
 *
 * @param {Uint8Array} freqData raw FFT magnitude data
 * @param {number} count number of output bins
 * @param {number} sampleRate audio context sample rate (Hz)
 * @param {number} fftSize analyser fftSize
 * @param {number} minFreq lowest frequency to include (Hz)
 * @param {number} maxFreq highest frequency to include (Hz)
 * @returns {Float32Array} normalized bins in [0, 1]
 */
export function spectrumToBins(freqData, count, sampleRate, fftSize, minFreq = 20, maxFreq = 20000) {
  const bins = new Float32Array(count);
  const binWidth = sampleRate / fftSize;
  const maxBin = Math.min(freqData.length, Math.floor(maxFreq / binWidth));
  const minBin = Math.max(1, Math.floor(minFreq / binWidth));
  if (maxBin <= minBin) return bins;

  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);

  for (let i = 0; i < count; i++) {
    const start = Math.floor(Math.exp(logMin + (logMax - logMin) * (i / count)));
    const end = Math.max(start + 1, Math.floor(Math.exp(logMin + (logMax - logMin) * ((i + 1) / count))));
    let sum = 0;
    for (let j = start; j < end && j < freqData.length; j++) sum += freqData[j];
    const n = end - start;
    if (n > 0) bins[i] = sum / n / 255;
  }
  return bins;
}

/**
 * Average of normalized bins[start..end). Used to derive bass/mid/treble bands.
 */
export function bandLevel(bins, start, end) {
  if (start >= end) return 0;
  let sum = 0;
  const n = Math.min(end, bins.length) - start;
  if (n <= 0) return 0;
  for (let i = start; i < start + n; i++) sum += bins[i];
  return sum / n;
}

/**
 * Onset-style beat detector. Two envelopes track the signal:
 *   - `energy` (fast attack, slow release) snaps up on transients like kicks,
 *   - `avg` (slow) tracks the long-term loudness.
 * A beat fires when the fast envelope spikes well above the slow average.
 * Sustained constant loudness eventually raises the average so it stops
 * firing; a cooldown prevents a single transient from retriggering.
 */
export class BeatDetector {
  constructor({ threshold = 1.3, minInterval = 0.18, baseline = 0.04 } = {}) {
    this.threshold = threshold;
    this.minInterval = minInterval;
    this.baseline = baseline;
    this.energy = baseline;
    this.avg = baseline;
    this.lastBeat = Infinity;
  }

  /**
   * @param {number} bass normalized bass energy in [0, 1]
   * @param {number} dt seconds since last update
   * @returns {boolean} true when a beat is detected this frame
   */
  update(bass, dt) {
    const k = bass > this.energy ? 0.3 : 0.04; // fast attack, slow release
    this.energy += (bass - this.energy) * k;
    this.avg += (bass - this.avg) * 0.02;
    this.lastBeat += dt;
    if (
      this.energy > this.avg * this.threshold &&
      this.energy > this.baseline &&
      this.lastBeat >= this.minInterval
    ) {
      this.lastBeat = 0;
      return true;
    }
    return false;
  }
}
