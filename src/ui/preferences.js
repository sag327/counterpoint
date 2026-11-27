const PREFERENCES_KEY = 'counterpoint.preferences.v1';
// Playback speeds offered in the UI: 1/4 to 1/12 of real time (creator decision 2026-11-27).
export const DILATIONS = Object.freeze([4, 5, 6, 8, 10, 12]);
const DEFAULTS = { dilation: 4, palette: 'chamber', voicing: 'balanced', volume: 0.3, muted: false };

// Each edition keeps its own preferences (suffix), so a preview never changes the full site's.
let storageKey = PREFERENCES_KEY;

export function readPreferences(palettes, voicings, suffix = '') {
  storageKey = PREFERENCES_KEY + suffix;
  let stored;
  try { stored = JSON.parse(window.localStorage.getItem(storageKey)); }
  catch { return { ...DEFAULTS }; }
  if (!stored || typeof stored !== 'object') return { ...DEFAULTS };
  return {
    dilation: DILATIONS.includes(stored.dilation) ? stored.dilation : DEFAULTS.dilation,
    palette: palettes.includes(stored.palette) ? stored.palette : DEFAULTS.palette,
    voicing: voicings.includes(stored.voicing) ? stored.voicing : DEFAULTS.voicing,
    volume: Number.isFinite(stored.volume) && stored.volume >= 0 && stored.volume <= 0.7 ? stored.volume : DEFAULTS.volume,
    muted: typeof stored.muted === 'boolean' ? stored.muted : DEFAULTS.muted,
  };
}

export function savePreferences(preferences) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(preferences)); }
  catch { /* Storage may be unavailable when a browser opens the local HTML. */ }
}

// A dilation as the creator asked to see it: a fraction of real time (2026-11-27).
export function dilationLabel(dilation) {
  return `1/${dilation} speed`;
}
