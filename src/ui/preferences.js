const PREFERENCES_KEY = 'counterpoint.preferences.v1';
// Playback speeds offered in the UI: real time and three slow playback rates (creator decision 2026-11-27).
export const DILATIONS = Object.freeze([1, 4, 8, 12]);
import { clampPacingCycle } from '../runtime/transport.js';
const DEFAULTS = { dilation: 4, volume: 0.3, muted: false, pacingCycleMs: 600 };

// Each edition keeps its own preferences (suffix), so a preview never changes the full site's.
let storageKey = PREFERENCES_KEY;

export function readPreferences(suffix = '') {
  storageKey = PREFERENCES_KEY + suffix;
  let stored;
  try { stored = JSON.parse(window.localStorage.getItem(storageKey)); }
  catch { return { ...DEFAULTS }; }
  if (!stored || typeof stored !== 'object') return { ...DEFAULTS };
  return {
    dilation: DILATIONS.includes(stored.dilation) ? stored.dilation : DEFAULTS.dilation,
    volume: Number.isFinite(stored.volume) && stored.volume >= 0 && stored.volume <= 0.7 ? stored.volume : DEFAULTS.volume,
    muted: typeof stored.muted === 'boolean' ? stored.muted : DEFAULTS.muted,
    pacingCycleMs: stored.pacingCycleMs === undefined ? DEFAULTS.pacingCycleMs : clampPacingCycle(stored.pacingCycleMs),
  };
}

export function savePreferences(preferences) {
  try { window.localStorage.setItem(storageKey, JSON.stringify(preferences)); }
  catch { /* Storage may be unavailable when a browser opens the local HTML. */ }
}

// A dilation as the creator asked to see it: a fraction of real time (2026-11-27).
export function dilationLabel(dilation) {
  return dilation === 1 ? "1" : `1/${dilation}`;
}
