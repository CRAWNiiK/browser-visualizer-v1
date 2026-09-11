// Shared uniform block for the WebGPU visualizers. The JS side of each
// visualizer writes every field once per frame (see nebula.js / smoke.js);
// field names must stay in sync with the `params` object set from JS.

export struct Params {
  time: f32,       // seconds since app start (pauses with the app)
  dt: f32,         // seconds since last frame
  bass: f32,       // smoothed low band, 0..1
  mid: f32,        // smoothed mid band, 0..1
  treble: f32,     // smoothed high band, 0..1
  level: f32,      // smoothed overall loudness, 0..1
  beatEnergy: f32, // 1 right after a beat, decays toward 0
  beatTime: f32,   // seconds since the last beat
  intensity: f32,  // user intensity slider, 0..2
  hue: f32,        // theme base hue (includes hue shift/cycle), degrees
  sat: f32,        // theme saturation, 0..1
  light: f32,      // theme lightness, 0..1
  mirror: f32,     // 1.0 when mirror mode is on
  resolution: vec2f, // render target size in device pixels
  background: vec3f, // theme background color, linear 0..1
}
