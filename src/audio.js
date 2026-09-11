// Browsers can't read the system's audio output directly. The only way a web
// app can hear "whatever is playing" is to capture it through the screen-share
// API (getDisplayMedia) with audio enabled — the user picks a screen, window,
// or tab and its audio becomes a MediaStream we can analyze. Nothing is
// recorded or uploaded; it's all local.

/**
 * Whether this browser can capture system/tab audio via getDisplayMedia.
 * Chromium browsers (Chrome, Edge, Vivaldi, …) can; Firefox has never
 * implemented audio in screen shares — its dialog offers no audio checkbox
 * and the returned stream is always video-only — so opening the share
 * dialog there is a dead end. There is no feature-detect for this, so a UA
 * check is the honest option.
 */
export function systemAudioSupport(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /firefox/i.test(ua) ? 'unavailable' : 'available';
}

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
    throw new Error(
      'No audio was shared. Pick a tab or window that is playing sound and enable "Share tab audio" — or use the microphone button instead.',
    );
  }
  return stream;
}

/**
 * Capture the microphone instead — works in every browser, including
 * Firefox and Safari which cannot capture system audio. The mic hears
 * whatever is playing out loud through the speakers. Analysis-only: the
 * stream is never played back, recorded, or sent anywhere.
 */
export async function startMicCapture() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Microphone capture is not supported in this browser.');
  }
  // Music-friendly constraints: every default here would fight the signal
  // (echo cancellation eats bass, AGC rides the volume, NS kills reverb tails).
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
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
