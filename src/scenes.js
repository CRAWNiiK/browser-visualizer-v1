// Preset scenes for the gallery. Each scene is a partial settings object
// (visualizer/theme/sliders/toggles) plus display metadata; normalize() in
// settings.js fills any gaps and clamps values.
export const SCENES = [
  {
    id: 'neon-bars',
    name: 'Neon Bars',
    description: 'Classic bars, electric neon.',
    visualizer: 0, theme: 0, intensity: 70, smoothing: 50, hue: 0, hueCycle: false, mirror: false, flash: false,
  },
  {
    id: 'sunset-waves',
    name: 'Sunset Waves',
    description: 'Slow, warm waveforms.',
    visualizer: 2, theme: 1, intensity: 80, smoothing: 70, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
  {
    id: 'deep-space',
    name: 'Deep Space',
    description: 'Drifting ember starfield.',
    visualizer: 7, theme: 3, intensity: 60, smoothing: 40, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
  {
    id: 'warp-drive',
    name: 'Warp Drive',
    description: 'Hyperspace tunnel, mirrored.',
    visualizer: 6, theme: 2, intensity: 90, smoothing: 30, hue: 0, hueCycle: true, mirror: true, flash: false,
  },
  {
    id: 'party-pulse',
    name: 'Party Pulse',
    description: 'Beat shockwaves, kaleidoscope.',
    visualizer: 5, theme: 0, intensity: 85, smoothing: 40, hue: 0, hueCycle: true, mirror: true, flash: false,
  },
  {
    id: 'aurora-orb',
    name: 'Aurora Orb',
    description: 'Living aurora blob.',
    visualizer: 4, theme: 5, intensity: 70, smoothing: 60, hue: 0, hueCycle: false, mirror: false, flash: false,
  },
  {
    id: 'mono-minimal',
    name: 'Mono Minimal',
    description: 'Clean, calm, monochrome.',
    visualizer: 0, theme: 4, intensity: 50, smoothing: 80, hue: 0, hueCycle: false, mirror: false, flash: false,
  },
  {
    id: 'radial-sunset',
    name: 'Radial Sunset',
    description: 'Rotating rings at dusk.',
    visualizer: 1, theme: 1, intensity: 75, smoothing: 50, hue: 20, hueCycle: false, mirror: false, flash: false,
  },
  {
    id: 'particle-fountain',
    name: 'Particle Fountain',
    description: 'Audio-reactive particle spray.',
    visualizer: 3, theme: 0, intensity: 80, smoothing: 45, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
];
