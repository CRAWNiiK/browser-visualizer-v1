# Soundwave — Audio Visualizer

A realtime audio visualizer that reacts to **whatever audio is playing on your system**.
Built with Vite + vanilla JS and the Canvas API. No dependencies beyond the build tooling.

## How it works

Browsers can't read the system's audio output directly, so the app captures audio through the
**screen-share API** (`getDisplayMedia`). When you click **Start listening** and pick a screen,
window, or tab, its audio becomes a local `MediaStream` that's analyzed with the Web Audio API.
Nothing is recorded or uploaded — it all stays in your browser. Works best in Chrome/Edge.

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

- **No audio / visuals stay flat** — capturing system audio only works in **Chrome or Edge**.
  When the share prompt appears, select the specific tab/window that's playing sound and make sure
  **"Share tab audio"** is checked. Firefox and Safari don't expose system audio to `getDisplayMedia`.
- **Popout window doesn't open** — your browser is blocking popups. Allow popups for the site, or
  trigger it with a click or keypress (which browsers always permit).
- **Port already in use** — pass a different port (see Configuration above).

## Features

- **8 visualizers** — Spectrum Bars, Radial Rings, Waveform, Particles, Orb, Shockwave,
  3D Tunnel, Starfield (switch with the picker or keys `1`–`8`)
- **Intensity slider** — scales how strongly the visuals react (keys `↑`/`↓`)
- **Smoothing slider** — tune the analyser's response time
- **Hue shift slider** + **Hue cycle** toggle for auto-cycling colors (`H`)
- **6 color themes** — Neon, Sunset, Ocean, Ember, Mono, Aurora
- **Mirror mode** — kaleidoscope flip (`M`)
- **Beat detection** — shockwave rings, particle bursts, and flash pulses on the beat
- **Safe flash** toggle to reduce strobe intensity
- **Pause** (`Space`), **fullscreen** (`F`), and a live **FPS** readout
- **Keyboard shortcuts** — `1`–`8` pick a visualizer, `←`/`→` cycle, `↑`/`↓` intensity,
  `H` hue cycle, `T` cycle theme, `M` mirror, `P` popout, `R` randomize, `G` scene gallery,
  `?` opens the help overlay
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
  audio.js                 System-audio capture + analyser setup
  audio-utils.js           Pure helpers: FFT binning, band levels, beat detector
  palette.js               Color themes + hue helpers
  visualizers/             One module per visualizer
tests/                     Unit tests (vitest) for the pure logic
```

## Testing

```bash
npm test
```
