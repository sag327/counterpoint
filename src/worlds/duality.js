import { directedLink, freezePreset } from './feedforward.js';

export function createDualityWorld() {
  return {
    worldId: 'duality',
    nodes: [
      { id: 'A', erpMs: 180, recoveryTailMs: 150, automaticity: { cycleMs: 720, firstAttemptMs: 0, resetOnCapture: true } },
      { id: 'A1', erpMs: 200, recoveryTailMs: 150, automaticity: null },
      { id: 'A2', erpMs: 220, recoveryTailMs: 150, automaticity: null },
      { id: 'B', erpMs: 240, recoveryTailMs: 150, automaticity: { cycleMs: 1030, firstAttemptMs: 170, resetOnCapture: true } },
      { id: 'B1', erpMs: 240, recoveryTailMs: 150, automaticity: null },
      { id: 'B2', erpMs: 240, recoveryTailMs: 150, automaticity: null },
    ],
    links: [
      directedLink('AA1', 'A', 'A1', 45),
      directedLink('AA2', 'A', 'A2', 85),
      directedLink('BB1', 'B', 'B1', 60),
      directedLink('BB2', 'B', 'B2', 110),
    ],
  };
}

export const dualityWorld = freezePreset(createDualityWorld());
