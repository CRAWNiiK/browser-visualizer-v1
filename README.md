# Soundwave — Audio Visualizer

A realtime audio visualizer that reacts to **whatever audio is playing on your system**.
Built with Vite + vanilla JS, the Canvas 2D API, and WebGPU (via [vgpu](https://vgpu.sh)).
No dependencies beyond the build tooling, vgpu, and its WGSL loader.

## How it works

Browsers can't read the system's audio output directly, so the app captures audio through the
**screen-share API** (`getDisplayMedia`). When you click **Start listening** and pick a screen,
window, or tab, its audio becomes a local `MediaStream` that's analyzed with the Web Audio API.
Nothing is recorded or uploaded — it all stays in your browser. Works best in Chrome/Edge.

## Beat detection algorithm

Beat detection is an onset-detection approach that finds the transient spikes in the music —
kicks, snares, and other sharp attacks — without any machine learning or beat-tracking library.
It is implemented in `src/audio-utils.js` (`BeatDetector`) and driven from `src/engine.js`.

**1. Analysis** — The Web Audio API `AnalyserNode` uses an FFT size of 2048 (1024 frequency
bins). The raw byte frequency data is condensed into 64 bins spaced **logarithmically** across
20 Hz–20 kHz, matching how human hearing works. The first few bins (roughly 20–200 Hz) are
summed into a single **bass energy** value in `[0, 1]` each frame, and it's this bass signal that
the beat detector reads.

**2. Two envelopes** — The detector tracks two smoothed values of the bass energy:

- **Fast envelope (`energy`)** — attacks quickly (coefficient `0.3`) but releases slowly
  (`0.04`), so it snaps up on transients and then falls off gradually.
- **Slow envelope (`avg`)** — updates slowly (`0.02`) and represents the long-term loudness of
  the track.

**3. Onset condition** — A beat fires when the fast envelope rises above the slow one by a fixed
ratio:

```text
energy > avg × 1.3   AND   energy > 0.04   AND   time since last beat ≥ 0.18 s
```

- The `1.3` ratio (threshold) means only a clear spike above the running average counts as a beat.
- The `0.04` baseline ignores near-silence.
- The `0.18 s` cooldown (min interval) prevents a single loud hit from double-firing and roughly
  bounds detection to ~333 BPM.

**4. Why it self-corrects** — Because the slow average keeps rising during a sustained loud
passage, a constant synth pad or continuous noise eventually stops producing beats. Detection
only responds to genuine *changes* in energy, not absolute loudness.

**5. Visual payoff** — When a beat fires, `engine.js` sets a `beatEnergy` value of `1`, which
decays exponentially each frame. The visualizers read that value to trigger shockwave rings,
particle bursts, a subtle full-screen flash, and other one-shot effects, so the visuals pulse in
sync with the music's rhythm.

## Requirements

- **Node.js 20.19+** or **22.12+** (required by Vite 8). Check your version with `node --version`.
- **npm** (bundled with Node).

The `engines` field in `package.json` records this, so `npm install` warns you if your Node is too old.

## Getting started

```bash
npm install
npm run dev      # start the dev server (URL printed in the terminal)
```

Or build and preview:

```bash
npm run build
npm run preview
```

## Deploying to GitHub Pages

A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs the test suite, builds the app,
and deploys it to GitHub Pages on every push to `main`. To enable it once:

1. Push this repo to GitHub with `main` as the default branch.
2. In the repo's **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Open the **Actions** tab and wait for the **Deploy to GitHub Pages** workflow to finish.
4. The deployed site will be at `https://<you>.github.io/<repo>/` (the workflow also links to it
   from the deployment summary).

The app uses a relative Vite `base`, so it works from the project subpath with no extra config.
The site must be served over HTTPS for browser screen/audio capture to work; GitHub Pages provides
that automatically.

## Configuration

There are no config files to edit — most behavior is set in the UI and saved to your browser's
`localStorage`. A couple of useful command-line options:

- **Port** — Vite picks a port automatically. To force one:

  ```bash
  npm run dev -- --port 3000
  ```

- **Access from another device** (e.g. your phone on the same Wi-Fi):

  ```bash
  npm run dev -- --host
  ```

## Troubleshooting

- **No audio / visuals stay flat** — capturing system audio works in **Chromium browsers**
  (Chrome, Edge, Vivaldi, …). When the share prompt appears, select the specific tab/window
  that's playing sound and make sure **"Share tab audio"** (or, for the whole screen on Windows,
  **"Share system audio"**) is checked.
- **Firefox can't capture system audio at all** — its share dialog has no audio option (a
  browser limitation, not a Soundwave bug). Soundwave tells you this up front; use the
  **🎤 Use microphone** button instead: it visualizes whatever is playing out loud through
  your speakers, including an external player. The same fallback works in Safari.
- **Popout window doesn't open** — your browser is blocking popups. Allow popups for the site, or
  trigger it with a click or keypress (which browsers always permit).
- **Port already in use** — pass a different port (see Configuration above).

## Features

- **10 visualizers** — Spectrum Bars, Radial Rings, Ridge, Storm, Aurora, Ripples,
  Terrain, Bloom, Nebula, Smoke (switch with the picker or keys `1`–`9`, `0`).
  Eight of them render on the GPU via **WebGPU** with [vgpu](https://vgpu.sh):
  **Ridge** (perspective spectral-history mountains), **Storm** (80k compute-shader
  particles in a curl-noise flow field), **Aurora** (raymarched volumetric light
  curtains), **Ripples** (a real wave-equation pond), **Terrain** (a spectrum mountain
  flyover), **Bloom** (Gray-Scott reaction-diffusion colonies), plus **Nebula**
  (volumetric noise clouds) and **Smoke** (a full fluid simulation with vorticity
  confinement and a Jacobi pressure solve). Spectrum Bars and Radial Rings stay on
  Canvas 2D as calm, readable options. On browsers without WebGPU the GPU ones fall
  back to a themed placeholder with an explanatory hint.
- **GPU note** — the GPU visualizers use your graphics card (only ~1.3 MB of VRAM for
  Storm's particle buffer, but real compute throughput). Any modern GPU including
  integrated graphics is fine; on old or weak cards the heavy ones (Storm, Smoke,
  Terrain) may drop below 60 fps — the live FPS readout tells you, and the Canvas 2D
  visualizers are always there.
- **Intensity slider** — scales how strongly the visuals react (keys `↑`/`↓`)
- **Smoothing slider** — tune the analyser's response time
- **Hue shift slider** + **Hue cycle** toggle for auto-cycling colors (`H`)
- **6 color themes** — Neon, Sunset, Ocean, Ember, Mono, Aurora
- **Mirror mode** — kaleidoscope flip (`M`)
- **Beat detection** — shockwave rings, particle bursts, and flash pulses on the beat
- **Pointer trail** — move the mouse across the Smoke visualizer to paint dye into the fluid
  (touch/pen work too; velocity and trail thickness follow your stroke)
- **Safe flash** toggle to reduce strobe intensity
- **Pause** (`Space`), **fullscreen** (`F`), and a live **FPS** readout
- **Keyboard shortcuts** — `1`–`9`, `0` pick a visualizer, `←`/`→` cycle, `↑`/`↓` intensity,
  `H` hue cycle, `T` cycle theme, `M` mirror, `P` popout, `R` randomize, `G` scene gallery,
  `C` hide/show the settings menu, `?` opens the help overlay
- **Shareable links** — the address bar always reflects your settings; hit the **🔗** button
  (or copy the URL) to share a link that restores the exact same visualizer, theme, and sliders
- **Remembered settings** — your last setup is saved to `localStorage` and restored on reload
  (a shared URL hash always wins over remembered settings)
- **Popout window** — the **⧉** button opens a real separate browser window (via `window.open`)
  you can move to any screen and resize freely. The main window pushes each analysed audio frame
  (frequency bins + waveform) to it over `postMessage`, plus your settings, and it has its own
  visualizer/intensity controls. If the main tab goes to the background (browsers pause its
  animation loop), the popout offers a **Start listening here** button to capture audio directly
  so it keeps running independently
- **🎲 Randomize** — one click randomizes visualizer, theme, sliders, and toggles
- **Scene gallery** — the **Scenes** button opens a gallery of preset combos with live thumbnails;
  click any to apply it

## Project structure

```
index.html                 App shell (canvas, overlay, control bar)
src/
  main.js                  UI wiring + keyboard shortcuts
  engine.js                rAF loop, audio reading, beat detection, mirror/flash
  gpu.js                   Shared WebGPU runtime (vgpu init + surface, graceful fallback)
  gpu-backend.js           Shared multi-pass vgpu backend (targets, ping-pong, passes)
  smoke-sim.js             The smoke fluid sim's pass graph (framework-agnostic, testable)
  audio.js                 System-audio/mic capture + analyser setup
  audio-utils.js           Pure helpers: FFT binning, band levels, beat detector
  palette.js               Color themes + hue helpers
  visualizers/             One module per visualizer
    shaders/               WGSL shaders + shared modules for the GPU visualizers
tests/                     Unit tests (vitest) for the pure logic
```

## Testing

```bash
npm test
```

Shader sources live in `src/visualizers/shaders/` as `.wgsl` modules (imported at build
time by the `@vgpu/wgsl` Vite plugin). Vite does **not** validate WGSL, so shader changes
are checked with vgpu's CLI — it compiles every shader against a real WebGPU device
(headless Dawn) and reports binding/type errors with exact locations:

```bash
npx vgpu check src/visualizers/shaders/*.wgsl --require-validation
```
