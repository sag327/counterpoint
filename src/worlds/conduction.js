import { both, link, sinusFocus, site, way, world } from './kit.js';
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

// The interactive tree uses the same recovery laws as Echo and Circulation.
// Antegrade slowing builds as the wave enters the recovering AV node.
// The fixed-ERP preset above is retained for the contract v1 reference cases.
export function createRestitutionConduction() {
  return world('conduction', [
    site('S', 'sinus', 200, { restitution: [40, 90], automaticity: sinusFocus(800), audible: true }),
    site('A', 'atrial', 220, { restitution: [45, 90] }),
    site('N', 'nodal', 310, { restitution: [90, 130], audible: true }),
    site('H', 'hisPurkinje', 180, { restitution: [35, 95] }),
    site('V1', 'ventricular', 260, { restitution: [60, 80] }),
    site('V2', 'ventricular', 260, { restitution: [60, 80] }),
  ], [
    both('SA', 'S', 'A', 25, { decrement: [10, 85], entry: [12, 60] }),
    link('AN', 'A', 'N',
      way(35, { decrement: [100, 150], entry: [110, 150] }),
      way(35, { decrement: [12, 85], entry: [18, 65] })),
    link('NH', 'N', 'H',
      way(65, { decrement: [10, 120], entry: [12, 60] }),
      way(65, { decrement: [90, 120], entry: [12, 60] })),
    both('HV1', 'H', 'V1', 25, { decrement: [10, 85], entry: [10, 60] }),
    both('HV2', 'H', 'V2', 45, { decrement: [10, 85], entry: [10, 60] }),
  ]);
}
