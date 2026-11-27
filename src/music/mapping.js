const worldAssignments = {
  circulation: {
    R0: [62, "felt", 0],
    R1: [65, "pluck", 0.25],
    R2: [69, "felt", 0.40],
    R3: [72, "glass", 0.25],
    R4: [74, "glass", 0],
    R5: [69, "pluck", -0.25],
    R6: [67, "felt", -0.40],
    R7: [65, "bow", -0.25],
  },
  conduction: {
    S: [62, "felt", 0],
    A: [69, "pluck", -0.15],
    N: [65, "glass", 0.12],
    H: [72, "pluck", 0],
    V1: [50, "bow", -0.22],
    V2: [57, "felt", 0.22],
  },
  duality: {
    A: [62, "felt", -0.23],
    A1: [65, "pluck", -0.28],
    A2: [69, "glass", -0.18],
    B: [50, "bow", 0.23],
    B1: [55, "felt", 0.28],
    B2: [60, "glass", 0.18],
  },
};

const voicingPitches = {
  balanced: {},
  open: { R2: 67, R3: 69, R5: 57, R6: 60 },
  suspended: { R1: 67, R2: 72, R3: 76, R4: 69, R7: 65 },
};

export const CHAMBER_VOICINGS = Object.freeze(Object.keys(voicingPitches));

const voiceSettings = {
  felt: { gain: 0.23, attackSec: 0.007, releaseSec: 0.85, brightness: 0.68, reverbSend: 0.18 },
  pluck: { gain: 0.22, attackSec: 0.004, releaseSec: 0.58, brightness: 0.76, reverbSend: 0.14 },
  bow: { gain: 0.24, attackSec: 0.066, releaseSec: 1.0, brightness: 0.51, reverbSend: 0.21 },
  glass: { gain: 0.19, attackSec: 0.018, releaseSec: 0.93, brightness: 0.63, reverbSend: 0.23 },
};

const paletteSettings = {
  chamber: { gain: 1, attack: 1, release: 1, brightness: 1, reverb: 1 },
  atmosphere: { gain: 0.8, attack: 2.5, release: 1.65, brightness: 0.70, reverb: 1.7 },
  minimalism: { gain: 0.96, attack: 0.6, release: 0.58, brightness: 1.16, reverb: 0.28 },
};

export const PALETTES = Object.freeze(Object.keys(paletteSettings));

const isV11World = (world) => world?.contractVersion === "1.1.0";

// Music table for a world. v1.0 worlds return null: the mapper keeps its
// built-in per-world assignments, so v0.1 notes are unchanged. v1.1 worlds use
// the study presentation's table ([midi, voice, pan] per site); every site the
// world marks audible:false maps to null whatever the table says, so silent
// tissue (nodal, sinus) never sounds.
export function musicTableFor(world, presentation = null) {
  if (!isV11World(world)) return null;
  // The original scenes keep their built-in instruments and voicings.
  if (["circulation", "conduction"].includes(world.worldId) && !presentation?.music
    && world.nodes.every(node => node.audible !== false && Object.hasOwn(worldAssignments[world.worldId], node.id))) return null;
  const declared = presentation?.music ?? {};
  const table = {};
  for (const node of world.nodes) {
    if (node.audible === false) {
      table[node.id] = null;
      continue;
    }
    const assignment = Object.hasOwn(declared, node.id) ? declared[node.id] : undefined;
    if (!Array.isArray(assignment)) throw new RangeError(`Missing music assignment for ${world.worldId}/${node.id}`);
    table[node.id] = Object.freeze([...assignment]);
  }
  return Object.freeze(table);
}

export function describeNodeMusic(worldId, nodeId, { voicing = "balanced", nodes } = {}) {
  const pitches = Object.hasOwn(voicingPitches, voicing) && voicingPitches[voicing];
  if (!pitches) throw new RangeError("Unknown musical voicing");

  const assignments = nodes || (Object.hasOwn(worldAssignments, worldId) && worldAssignments[worldId]);
  const assignment = assignments ? (Object.hasOwn(assignments, nodeId) ? assignments[nodeId] : undefined) : undefined;
  if (assignment === null) return null;
  if (!assignment) throw new RangeError(`Missing music assignment for ${worldId}/${nodeId}`);

  const [midi, voice, pan] = assignment;
  if (!Object.hasOwn(voiceSettings, voice) || !Number.isFinite(midi) || !Number.isFinite(pan) || Math.abs(pan) > 1) {
    throw new RangeError(`Invalid music assignment for ${nodeId}`);
  }
  const pitchMidi = !nodes && worldId === "circulation" ? pitches[nodeId] ?? midi : midi;
  return Object.freeze({ pitchMidi, pitchHz: 440 * 2 ** ((pitchMidi - 69) / 12), voice, pan });
}

export function mapActivation(event, { voicing = "balanced", palette = "chamber", nodes } = {}) {
  if (event.type !== "activation") return null;
  const scale = Object.hasOwn(paletteSettings, palette) && paletteSettings[palette];
  if (!scale) throw new RangeError("Unknown musical palette");

  const identity = describeNodeMusic(event.worldId, event.nodeId, { voicing, nodes });
  if (!identity) return null;
  const { pitchHz, voice, pan } = identity;
  const settings = voiceSettings[voice];
  const recovery = Math.min(1, Math.max(0, event.recoveryBefore));
  const smoothRecovery = recovery * recovery * (3 - 2 * recovery);

  return Object.freeze({
    runId: event.runId,
    eventId: event.eventId,
    tMs: event.tMs,
    pitchHz,
    voice,
    gain: settings.gain * scale.gain * (0.55 + 0.45 * recovery),
    attackSec: settings.attackSec * scale.attack,
    releaseSec: settings.releaseSec * scale.release * (0.65 + 0.35 * recovery),
    brightness: settings.brightness * scale.brightness * (0.55 + 0.45 * smoothRecovery),
    pan,
    reverbSend: settings.reverbSend * scale.reverb,
  });
}
