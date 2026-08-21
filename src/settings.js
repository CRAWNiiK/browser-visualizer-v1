// Pure, testable helpers for turning the app's settings into a shareable URL
// hash and back. Keys are single letters to keep links short.

export const DEFAULTS = {
  visualizer: 0, // index into VISUALIZERS
  intensity: 50, // 0..100 (slider value)
  smoothing: 60, // 0..100 (slider value)
  hue: 0, // 0..360 (slider value)
  hueCycle: false,
  theme: 0, // index into THEMES
  mirror: false,
  flash: false,
};

const CODES = {
  visualizer: 'v',
  intensity: 'i',
  smoothing: 's',
  hue: 'h',
  hueCycle: 'c',
  theme: 't',
  mirror: 'm',
  flash: 'f',
};

const LIMITS = {
  visualizer: [0, 9],
  intensity: [0, 100],
  smoothing: [0, 100],
  hue: [0, 360],
  theme: [0, 5],
};

const BOOLEAN_KEYS = ['hueCycle', 'mirror', 'flash'];

function clampInt(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Encode a settings object as a query string, e.g. "v=3&i=80&c=1".
 */
export function encode(settings) {
  const params = new URLSearchParams();
  for (const [key, code] of Object.entries(CODES)) {
    const val = settings[key];
    if (val === undefined || val === null) continue;
    params.set(code, val === true ? '1' : val === false ? '0' : String(val));
  }
  return params.toString();
}

/**
 * Decode a query string (without the leading "#") into a full settings object.
 * Missing, unknown, out-of-range, or non-numeric values fall back to defaults.
 */
export function decode(query) {
  const params = new URLSearchParams(query);
  const out = { ...DEFAULTS };
  for (const [key, code] of Object.entries(CODES)) {
    const raw = params.get(code);
    if (raw === null) continue;
    if (BOOLEAN_KEYS.includes(key)) {
      out[key] = raw === '1' || raw === 'true';
    } else {
      const num = Number(raw);
      out[key] = Number.isFinite(num) ? clampInt(num, LIMITS[key][0], LIMITS[key][1]) : DEFAULTS[key];
    }
  }
  return out;
}

/**
 * Coerce a partial settings object (e.g. a saved scene) into a complete,
 * valid settings object: unknown keys are dropped, missing keys filled from
 * defaults, and numeric values clamped to their allowed ranges.
 */
export function normalize(settings) {
  return decode(encode({ ...DEFAULTS, ...settings }));
}
