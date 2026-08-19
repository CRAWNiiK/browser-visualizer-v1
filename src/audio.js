// Browsers can't read the system's audio output directly. The only way a web
// app can hear "whatever is playing" is to capture it through the screen-share
// API (getDisplayMedia) with audio enabled — the user picks a screen, window,
// or tab and its audio becomes a MediaStream we can analyze. Nothing is
// recorded or uploaded; it's all local.

/**
 * Ask the user to share a screen/window/tab and return the resulting stream.
 * Throws with a friendly message if no audio track is available.
 */
export async function startCapture() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
    throw new Error('Screen capture is not supported in this browser. Try Chrome or Edge.');
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error('No audio was captured. Pick a screen, window, or tab that is playing sound.');
  }
  return stream;
}

/**
 * Build a Web Audio graph that routes the captured stream into an AnalyserNode.
 * The analyser is deliberately NOT connected to the destination, so nothing is
 * played back (no echo) — we only read its frequency/time data.
 */
export function createAnalyser(stream) {
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048; // 1024 frequency bins
  analyser.smoothingTimeConstant = 0.6;
  source.connect(analyser);
  return { audioCtx, analyser };
}
