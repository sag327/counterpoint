const PREFERENCES_KEY = 'counterpoint.preferences.v1';
const DEFAULTS = { dilation: 4, palette: 'chamber', voicing: 'balanced', volume: 0.3, muted: false };

export function readPreferences(palettes, voicings) {
  let stored;
  try { stored = JSON.parse(window.localStorage.getItem(PREFERENCES_KEY)); }
  catch { return { ...DEFAULTS }; }
  if (!stored || typeof stored !== 'object') return { ...DEFAULTS };
  return {
    dilation: Number.isInteger(stored.dilation) && stored.dilation >= 1 && stored.dilation <= 8 ? stored.dilation : DEFAULTS.dilation,
    palette: palettes.includes(stored.palette) ? stored.palette : DEFAULTS.palette,
    voicing: voicings.includes(stored.voicing) ? stored.voicing : DEFAULTS.voicing,
    volume: Number.isFinite(stored.volume) && stored.volume >= 0 && stored.volume <= 0.7 ? stored.volume : DEFAULTS.volume,
    muted: typeof stored.muted === 'boolean' ? stored.muted : DEFAULTS.muted,
  };
}

export function savePreferences(preferences) {
  try { window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences)); }
  catch { /* Storage may be unavailable when a browser opens the local HTML. */ }
}
