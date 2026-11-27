// Shared builders for the Study No. 2 worlds (contract 1.1.0). Worlds are plain
// data: topology, refractoriness, restitution, decrement, entry slowing and
// automaticity. Nothing here schedules an activation.

export const V11 = '1.1.0';

const SILENT_TISSUES = new Set(['nodal', 'sinus']);

// One site. `restitution` is [amplitudeMs, tauMs] (erpMax = erpMs, erpMin = erpMs - amplitude,
// the lowest value the law can reach) or [amplitudeMs, tauMs, erpMinMs].
export function site(id, tissue, erpMs, { restitution = null, automaticity = null, audible, recoveryTailMs = 120 } = {}) {
  const node = { id, erpMs, recoveryTailMs, automaticity, tissue, audible: audible ?? !SILENT_TISSUES.has(tissue) };
  if (restitution !== null) {
    const [amplitudeMs, tauMs, erpMinMs = erpMs - amplitudeMs] = restitution;
    node.restitution = { erpMaxMs: erpMs, amplitudeMs, tauMs, erpMinMs: Math.max(1, erpMinMs) };
  }
  return node;
}

// One direction. decrement and entry are [maxExtraMs, tauMs] or null.
export function way(delayMs, { decrement = null, entry = null, enabled = true } = {}) {
  return {
    enabled,
    delayMs,
    decrement: decrement === null ? null : { maxExtraMs: decrement[0], tauMs: decrement[1] },
    entry: entry === null ? null : { maxExtraMs: entry[0], tauMs: entry[1] },
  };
}

// A physical link. Omitting `ba` makes it one-way a -> b (ba disabled, same base delay).
export function link(id, a, b, ab, ba = null) {
  return { id, a, b, enabled: true, ab, ba: ba ?? way(ab.delayMs, { enabled: false }) };
}

// Same law both ways.
export const both = (id, a, b, delayMs, options = {}) => link(id, a, b, way(delayMs, options), way(delayMs, options));

export function sinusFocus(cycleMs = 800, { firstAttemptMs = 0, overdrive = { gainPerBeat: 0.06, maxMs: 450, warmupFactor: 0.6 } } = {}) {
  return { cycleMs, firstAttemptMs, resetOnCapture: true, overdrive: overdrive === null ? null : { ...overdrive } };
}

export function world(worldId, nodes, links, extra = {}) {
  return { contractVersion: V11, worldId, nodes, links, ...extra };
}

export function deepFreeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

// D-centred Dorian set used by every study (D F G A C, E for colour), as MIDI numbers.
export const PITCH = Object.freeze({
  D3: 50, F3: 53, G3: 55, A3: 57,
  D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, C5: 72, D5: 74, E5: 76,
  A5: 81, C6: 84, D6: 86,
});

// Voice by tissue (spec "Orchestration by tissue"). Atrial sites alternate felt and pluck.
export const TISSUE_VOICE = Object.freeze({ atrial: ['felt', 'pluck'], hisPurkinje: ['glass'], ventricular: ['bow'], accessory: ['glass'] });

// Music table for the mapper: audible sites get [midi, voice, pan]; silent sites map to null.
export function music(nodes, assignments) {
  const table = {};
  for (const node of nodes) table[node.id] = node.audible === false ? null : assignments[node.id];
  return table;
}

// Guided protocols only enqueue labelled stimuli and trains. `ids` makes
// command ids unique per call; every command is a stimulate or stimulateTrain.
export const stim = (commandId, tMs, nodeId) => ({ commandId, tMs, type: 'stimulate', nodeId });
export const pace = (commandId, tMs, nodeId, cycleMs, count, label) =>
  ({ commandId, tMs, type: 'stimulateTrain', nodeId, startMs: tMs, cycleMs, count, label });
