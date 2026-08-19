import { Engine } from './engine.js';
import { VISUALIZERS } from './visualizers/index.js';
import { THEMES } from './palette.js';
import { normalize } from './settings.js';
import { startCapture, createAnalyser } from './audio.js';

const canvas = document.getElementById('canvas');
const hint = document.getElementById('hint');
const hintText = document.getElementById('hintText');
const hintSub = document.getElementById('hintSub');
const hintError = document.getElementById('hintError');
const startBtn = document.getElementById('startBtn');
const nameEl = document.getElementById('name');
const intensity = document.getElementById('intensity');

const engine = new Engine(canvas);
engine.start();

let vizIndex = 0;

function selectViz(i) {
  vizIndex = (i + VISUALIZERS.length) % VISUALIZERS.length;
  engine.setVisualizer(VISUALIZERS[vizIndex].create);
  nameEl.textContent = VISUALIZERS[vizIndex].name;
}
selectViz(0);

document.getElementById('prev').addEventListener('click', () => selectViz(vizIndex - 1));
document.getElementById('next').addEventListener('click', () => selectViz(vizIndex + 1));
document.getElementById('close').addEventListener('click', () => window.close());

intensity.addEventListener('input', () => {
  engine.state.intensity = (Number(intensity.value) / 100) * 2;
});

function applySettings(s) {
  const norm = normalize(s);
  selectViz(norm.visualizer);
  engine.state.theme = THEMES[norm.theme];
  engine.state.hueShift = norm.hue;
  engine.state.hueCycle = norm.hueCycle;
  engine.state.mirror = norm.mirror;
  engine.state.flash = norm.flash;
  engine.state.intensity = (norm.intensity / 100) * 2;
  intensity.value = norm.intensity;
  engine.setSmoothing(0.05 + (norm.smoothing / 100) * 0.92);
}

// ---------- Audio source ----------
// 'none' | 'feed' (data pushed from the main window) | 'own' (captured here)
let audioMode = 'none';
let lastFeedAt = 0;
let ownCtx = null;

function setMode(mode) {
  audioMode = mode;
  const idle = mode === 'none';
  hint.classList.toggle('hidden', !idle);
  if (idle) {
    hintText.textContent = 'Waiting for audio…';
    hintSub.textContent =
      'Start sharing audio in the main Soundwave window, or listen here instead:';
  }
}

function setHintError(msg) {
  hintError.textContent = msg || '';
}

setMode('none');

// The main window only feeds frames while it's the active tab (browsers pause
// requestAnimationFrame in background tabs). If the feed stalls, offer to
// capture audio directly in this window so it keeps running regardless.
setInterval(() => {
  if (audioMode === 'feed' && performance.now() - lastFeedAt > 1200) {
    engine.clearAudioFeed();
    setMode('none');
  }
}, 500);

startBtn.addEventListener('click', async () => {
  setHintError('');
  try {
    const stream = await startCapture();
    const { audioCtx, analyser } = createAnalyser(stream);
    if (ownCtx) ownCtx.close().catch(() => {});
    ownCtx = audioCtx;
    engine.clearAudioFeed();
    engine.setAnalyser(analyser);
    setMode('own');
    // If the user stops sharing via the browser UI, the track ends.
    const track = stream.getAudioTracks()[0];
    track.addEventListener('ended', () => {
      engine.setAnalyser(null);
      setMode('none');
    });
  } catch (err) {
    setHintError((err && err.message) || 'Could not start capture.');
  }
});

window.addEventListener('message', (e) => {
  const data = e.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'audio' && data.bins && data.wave) {
    // Analysed frame from the main window. Ignored while capturing locally so
    // the local capture always wins.
    if (audioMode !== 'own') {
      engine.setAnalyser(null);
      engine.setAudioFeed({ bins: data.bins, wave: data.wave });
      lastFeedAt = performance.now();
      setMode('feed');
    }
  } else if (data.type === 'settings') {
    applySettings(data.settings);
  } else if (data.type === 'stop') {
    if (audioMode !== 'own') {
      engine.clearAudioFeed();
      setMode('none');
    }
  }
});

// Tell the main window we're loaded and ready to receive audio + settings.
if (window.opener) {
  window.opener.postMessage({ type: 'ready' }, '*');
}
