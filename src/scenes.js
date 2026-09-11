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
    id: 'sunset-ridge',
    name: 'Sunset Ridge',
    description: 'Spectral mountains at dusk.',
    visualizer: 2, theme: 1, intensity: 80, smoothing: 70, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
  {
    id: 'coral-garden',
    name: 'Coral Garden',
    description: 'Reaction-diffusion colonies growing with the beat.',
    visualizer: 7, theme: 3, intensity: 60, smoothing: 40, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
  {
    id: 'canyon-run',
    name: 'Canyon Run',
    description: 'Spectrum mountains, mirrored flight.',
    visualizer: 6, theme: 2, intensity: 90, smoothing: 30, hue: 0, hueCycle: true, mirror: true, flash: false,
  },
  {
    id: 'rain-pool',
    name: 'Rain Pool',
    description: 'Beat splashes on dark water, mirrored.',
    visualizer: 5, theme: 5, intensity: 75, smoothing: 40, hue: 0, hueCycle: true, mirror: true, flash: false,
  },
  {
    id: 'deep-nebula',
    name: 'Deep Nebula',
    description: 'Volumetric clouds that breathe with the bass.',
    visualizer: 8, theme: 5, intensity: 70, smoothing: 60, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
  {
    id: 'ink-flow',
    name: 'Ink Flow',
    description: 'Fluid dye curling with the music.',
    visualizer: 9, theme: 5, intensity: 85, smoothing: 45, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
  {
    id: 'night-curtains',
    name: 'Night Curtains',
    description: 'Volumetric aurora over dark ground.',
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
    id: 'particle-storm',
    name: 'Particle Storm',
    description: '200k GPU particles swirling to the music.',
    visualizer: 3, theme: 0, intensity: 80, smoothing: 45, hue: 0, hueCycle: true, mirror: false, flash: false,
  },
];
