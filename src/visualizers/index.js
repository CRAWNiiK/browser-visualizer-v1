import spectrum from './spectrum.js';
import radial from './radial.js';
import waterfall from './waterfall.js';
import storm from './storm.js';
import aurora from './aurora.js';
import ripples from './ripples.js';
import terrain from './terrain.js';
import bloom from './bloom.js';
import nebula from './nebula.js';
import smoke from './smoke.js';

// Indices 0-1 stay Canvas 2D (readable, calm); 2-9 render on the GPU via
// vgpu. Order is user-facing (keys 1-9, 0), so keep positions stable.
export const VISUALIZERS = [spectrum, radial, waterfall, storm, aurora, ripples, terrain, bloom, nebula, smoke];
