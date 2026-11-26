import { directedLink, freezePreset } from './feedforward.js';

export function createConductionWorld() {
  return {
    worldId: 'conduction',
    nodes: [
      { id: 'S', erpMs: 200, recoveryTailMs: 120, automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } },
      { id: 'A', erpMs: 220, recoveryTailMs: 120, automaticity: null },
      { id: 'N', erpMs: 250, recoveryTailMs: 120, automaticity: null },
      { id: 'H', erpMs: 180, recoveryTailMs: 120, automaticity: null },
      { id: 'V1', erpMs: 260, recoveryTailMs: 120, automaticity: null },
      { id: 'V2', erpMs: 260, recoveryTailMs: 120, automaticity: null },
    ],
    links: [
      directedLink('SA', 'S', 'A', 25),
      directedLink('AN', 'A', 'N', 35),
      directedLink('NH', 'N', 'H', 65, { maxExtraMs: 90, tauMs: 120 }),
      directedLink('HV1', 'H', 'V1', 25),
      directedLink('HV2', 'H', 'V2', 45),
    ],
  };
}

export const conductionWorld = freezePreset(createConductionWorld());
