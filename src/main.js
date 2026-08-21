import './styles.css';
import { Engine } from './engine.js';
import { VISUALIZERS } from './visualizers/index.js';
import { startCapture, createAnalyser } from './audio.js';
import { THEMES, themeColors } from './palette.js';
import { encode, decode, normalize } from './settings.js';
import { SCENES } from './scenes.js';
import { initPopout } from './popout.js';

const $ = (id) => document.getElementById(id);

const engine = new Engine($('canvas'));
engine.start();

let current = null; // { stream, audioCtx, analyser }
let popout = null; // external popout window manager (initialized below)

// ---------- Visualizer picker ----------
const vizContainer = $('vizButtons');
VISUALIZERS.forEach((v, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.textContent = v.name;
  btn.addEventListener('click', () => selectVisualizer(i));
  vizContainer.appendChild(btn);
});

let currentViz = 0;

function selectVisualizer(i, { silent = false } = {}) {
  currentViz = i;
  engine.setVisualizer(VISUALIZERS[i].create);
  [...vizContainer.children].forEach((b, bi) => b.classList.toggle('active', bi === i));
  if (!silent) {
    showToast(VISUALIZERS[i].name);
    syncUrl();
  }
}

function cycleVisualizer(dir) {
  selectVisualizer((currentViz + dir + VISUALIZERS.length) % VISUALIZERS.length);
}

selectVisualizer(0, { silent: true });

// ---------- Sliders ----------
function bindRange(id, onInput) {
  const input = $(id);
  input.addEventListener('input', () => {
    onInput(Number(input.value));
    syncUrl();
  });
}

bindRange('intensity', (v) => {
  engine.state.intensity = (v / 100) * 2; // 0..2, default 1
  $('intensityVal').textContent = `${Math.round(v)}%`;
});

bindRange('smoothing', (v) => {
  engine.setSmoothing(0.05 + (v / 100) * 0.92);
  $('smoothingVal').textContent = `${Math.round(v)}%`;
});

bindRange('hue', (v) => {
  engine.state.hueShift = v;
  $('hueVal').textContent = `${Math.round(v)}°`;
});

// ---------- Theme picker ----------
const themeContainer = $('themeButtons');
THEMES.forEach((theme, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.title = theme.name;
  btn.style.background = `linear-gradient(135deg, ${theme.hues
    .map((h) => `hsl(${h}, ${theme.sat}%, ${theme.light}%)`)
    .join(', ')})`;
  btn.addEventListener('click', () => selectTheme(i));
  themeContainer.appendChild(btn);
});
themeContainer.children[0].classList.add('active');

function selectTheme(i) {
  engine.state.theme = THEMES[i];
  [...themeContainer.children].forEach((b, bi) => b.classList.toggle('active', bi === i));
  syncUrl();
}

function cycleTheme() {
  const idx = THEMES.indexOf(engine.state.theme);
  selectTheme((idx + 1) % THEMES.length);
  showToast(`Theme: ${THEMES[(idx + 1) % THEMES.length].name}`);
}

// ---------- Toggles ----------
const TOGGLE_STATE_KEYS = { cycleBtn: 'hueCycle', mirrorBtn: 'mirror', flashBtn: 'flash' };

function setToggle(id, value) {
  engine.state[TOGGLE_STATE_KEYS[id]] = value;
  $(id).classList.toggle('active', value);
  syncUrl();
}

$('cycleBtn').addEventListener('click', () => setToggle('cycleBtn', !engine.state.hueCycle));
$('mirrorBtn').addEventListener('click', () => setToggle('mirrorBtn', !engine.state.mirror));
$('flashBtn').addEventListener('click', () => setToggle('flashBtn', !engine.state.flash));

// ---------- Pause ----------
const pauseBtn = $('pauseBtn');
function togglePause() {
  engine.state.paused = !engine.state.paused;
  pauseBtn.textContent = engine.state.paused ? '▶' : '⏸';
  pauseBtn.classList.toggle('active', engine.state.paused);
}
pauseBtn.addEventListener('click', togglePause);

// ---------- Fullscreen ----------
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}
$('fullscreenBtn').addEventListener('click', toggleFullscreen);

// ---------- Collapsible settings menu ----------
const controlsEl = $('controls');
const controlsTab = $('controlsTab');

function setControlsCollapsed(collapsed) {
  controlsEl.classList.toggle('collapsed', collapsed);
  controlsTab.classList.toggle('show', collapsed);
  $('collapseBtn').textContent = collapsed ? '⌃' : '⌄';
  $('collapseBtn').title = collapsed ? 'Show the settings menu (C)' : 'Hide the settings menu (C)';
}

function toggleControls() {
  setControlsCollapsed(!controlsEl.classList.contains('collapsed'));
}

$('collapseBtn').addEventListener('click', toggleControls);
controlsTab.addEventListener('click', toggleControls);

// ---------- Toast ----------
const toast = $('toast');
let toastTimer = null;
function showToast(text) {
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1200);
}

// ---------- Shareable settings ----------
function readSettings() {
  return {
    visualizer: currentViz,
    intensity: Number($('intensity').value),
    smoothing: Number($('smoothing').value),
    hue: Number($('hue').value),
    hueCycle: engine.state.hueCycle,
    theme: THEMES.indexOf(engine.state.theme),
    mirror: engine.state.mirror,
    flash: engine.state.flash,
  };
}

const STORAGE_KEY = 'soundwave.settings';

function syncUrl() {
  try {
    history.replaceState(null, '', `#${encode(readSettings())}`);
  } catch {
    /* ignore (e.g. sandboxed context) */
  }
  saveSettings();
  if (popout) popout.sync(readSettings());
}

function saveSettings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readSettings()));
  } catch {
    /* ignore */
  }
}

function applySettings(raw) {
  const s = normalize(raw);
  selectVisualizer(s.visualizer, { silent: true });

  $('intensity').value = s.intensity;
  $('intensity').dispatchEvent(new Event('input'));

  $('smoothing').value = s.smoothing;
  $('smoothing').dispatchEvent(new Event('input'));

  $('hue').value = s.hue;
  $('hue').dispatchEvent(new Event('input'));

  selectTheme(s.theme);
  setToggle('cycleBtn', s.hueCycle);
  setToggle('mirrorBtn', s.mirror);
  setToggle('flashBtn', s.flash);
}

// On load: a shared URL hash wins; otherwise restore remembered settings.
const initialHash = window.location.hash.slice(1);
if (initialHash) {
  applySettings(decode(initialHash));
} else {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) applySettings(JSON.parse(saved));
  } catch {
    /* ignore */
  }
}

// ---------- Share link ----------
$('shareBtn').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}${location.search}#${encode(readSettings())}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast('Share link copied!');
  } catch {
    window.prompt('Copy this share link:', url);
  }
});

// ---------- Randomize ----------
function randomize() {
  const ri = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  selectVisualizer(ri(0, VISUALIZERS.length - 1));
  selectTheme(ri(0, THEMES.length - 1));
  setSlider('intensity', ri(20, 90));
  setSlider('smoothing', ri(20, 90));
  setSlider('hue', ri(0, 360));
  setToggle('cycleBtn', Math.random() < 0.5);
  setToggle('mirrorBtn', Math.random() < 0.5);
  showToast('Randomized!');
}

function setSlider(id, value) {
  const input = $(id);
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

$('randomizeBtn').addEventListener('click', randomize);

// ---------- Scene gallery ----------
const scenesOverlay = $('scenesOverlay');
let scenesBuilt = false;

function openScenes() {
  if (!scenesBuilt) {
    buildSceneGrid();
    scenesBuilt = true;
  }
  scenesOverlay.classList.remove('hidden');
}

function closeScenes() {
  scenesOverlay.classList.add('hidden');
}

function buildSceneGrid() {
  const grid = $('sceneGrid');
  for (const scene of SCENES) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'scene-card';
    card.style.backgroundImage = `url(${generateThumb(scene)})`;
    card.title = scene.description;
    const name = document.createElement('span');
    name.className = 'scene-name';
    name.textContent = scene.name;
    card.appendChild(name);
    card.addEventListener('click', () => {
      applySettings(scene);
      closeScenes();
      showToast(`Scene: ${scene.name}`);
    });
    grid.appendChild(card);
  }
}

// Render a static preview of a scene by running its visualizer a few frames
// with synthetic audio data.
function generateThumb(scene) {
  const w = 220;
  const h = 130;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const theme = THEMES[scene.theme];

  const s = {
    width: w,
    height: h,
    dpr: 1,
    t: 0,
    dt: 0.016,
    freq: new Float32Array(64),
    wave: new Float32Array(1024),
    level: 0.5,
    bass: 0.5,
    mid: 0.5,
    treble: 0.5,
    beat: false,
    beatEnergy: 0,
    intensity: (scene.intensity / 100) * 2,
    hueShift: scene.hue,
    hue: 0,
    hueCycle: false,
    theme,
    colors: themeColors(theme, scene.hue),
    mirror: false,
    flash: false,
    paused: false,
    fps: 0,
  };

  // Synthetic spectrum + waveform so previews look alive.
  for (let i = 0; i < s.freq.length; i++) {
    s.freq[i] = 0.3 + 0.5 * Math.abs(Math.sin(i * 0.35)) * (1 - i / s.freq.length);
  }
  for (let i = 0; i < s.wave.length; i++) {
    s.wave[i] = Math.sin(i * 0.05) * 0.5 + Math.sin(i * 0.13) * 0.3;
  }

  const viz = VISUALIZERS[scene.visualizer].create();
  if (viz && typeof viz.init === 'function') viz.init(s);

  for (let f = 0; f < 24; f++) {
    ctx.fillStyle = theme.background;
    ctx.fillRect(0, 0, w, h);
    s.t += 0.016;
    s.beat = f === 12;
    s.beatEnergy = Math.max(0, 1 - f * 0.1);
    viz.draw(ctx, s);
  }

  return canvas.toDataURL('image/png');
}

$('scenesBtn').addEventListener('click', openScenes);
$('scenesCloseBtn').addEventListener('click', closeScenes);
scenesOverlay.addEventListener('click', (e) => {
  if (e.target === scenesOverlay) closeScenes();
});

// ---------- Popout (separate OS window) ----------
popout = initPopout({
  getSettings: () => readSettings(),
  getAudioData: () => (current ? { bins: engine.state.freq, wave: engine.state.wave } : null),
});

// Forward every analysed frame to the popout window.
engine.onAudioFrame = (data) => popout.sendAudioData(data);

function togglePopout() {
  if (popout.isOpen()) {
    popout.close();
  } else {
    const { blocked } = popout.open();
    if (blocked) showToast('Popup blocked — allow popups for this site');
  }
}

$('popoutBtn').addEventListener('click', togglePopout);

// ---------- Help overlay ----------
const helpOverlay = $('helpOverlay');
function toggleHelp(open) {
  const show = open === undefined ? helpOverlay.classList.contains('hidden') : open;
  helpOverlay.classList.toggle('hidden', !show);
}
$('helpBtn').addEventListener('click', () => toggleHelp(true));
$('helpCloseBtn').addEventListener('click', () => toggleHelp(false));
helpOverlay.addEventListener('click', (e) => {
  if (e.target === helpOverlay) toggleHelp(false);
});

// ---------- Start / stop capture ----------
const overlay = $('overlay');
const overlayError = $('overlayError');

async function start() {
  overlayError.textContent = '';
  try {
    const stream = await startCapture();
    const { audioCtx, analyser } = createAnalyser(stream);
    engine.setAnalyser(analyser);
    // Apply the current smoothing slider to the fresh analyser.
    engine.setSmoothing(0.05 + (Number($('smoothing').value) / 100) * 0.92);
    // The next engine frame forwards audio to the popout via onAudioFrame.
    current = { stream, audioCtx, analyser };
    // If the user stops sharing via the browser UI, the tracks end.
    stream.getTracks().forEach((t) => t.addEventListener('ended', stop));
    overlay.classList.add('hidden');
  } catch (err) {
    overlayError.textContent = err && err.message ? err.message : 'Could not start capture.';
  }
}

function stop() {
  if (current) {
    current.stream.getTracks().forEach((t) => t.stop());
    current.audioCtx.close();
    current = null;
  }
  engine.setAnalyser(null);
  popout.stopAudio();
  overlay.classList.remove('hidden');
}

$('startBtn').addEventListener('click', start);
$('stopBtn').addEventListener('click', stop);

// ---------- FPS readout ----------
setInterval(() => {
  $('fps').textContent = `${Math.round(engine.state.fps)} fps`;
}, 500);

// ---------- Keyboard shortcuts ----------
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.matches && e.target.matches('input, textarea')) return;

  if (e.key >= '1' && e.key <= '9') {
    selectVisualizer(Number(e.key) - 1);
  } else if (e.key === '0') {
    selectVisualizer(9);
  } else if (e.key === 'ArrowLeft') {
    cycleVisualizer(-1);
  } else if (e.key === 'ArrowRight') {
    cycleVisualizer(1);
  } else if (e.key === 'ArrowUp') {
    bumpIntensity(5);
  } else if (e.key === 'ArrowDown') {
    bumpIntensity(-5);
  } else if (e.key === ' ') {
    e.preventDefault();
    togglePause();
  } else if (e.key === 'f' || e.key === 'F') {
    toggleFullscreen();
  } else if (e.key === 'h' || e.key === 'H') {
    $('cycleBtn').click();
  } else if (e.key === 't' || e.key === 'T') {
    cycleTheme();
  } else if (e.key === 'm' || e.key === 'M') {
    $('mirrorBtn').click();
  } else if (e.key === 'p' || e.key === 'P') {
    togglePopout();
  } else if (e.key === 'r' || e.key === 'R') {
    randomize();
  } else if (e.key === 'g' || e.key === 'G') {
    openScenes();
  } else if (e.key === 'c' || e.key === 'C') {
    toggleControls();
  } else if (e.key === '?' || e.key === '/') {
    toggleHelp();
  } else if (e.key === 'Escape') {
    if (!helpOverlay.classList.contains('hidden')) toggleHelp(false);
    else if (!scenesOverlay.classList.contains('hidden')) closeScenes();
  }
});

function bumpIntensity(delta) {
  const input = $('intensity');
  input.value = Math.min(100, Math.max(0, Number(input.value) + delta));
  input.dispatchEvent(new Event('input'));
}
