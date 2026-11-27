// I. Prelude — Conduction v1.1: sinus rhythm with overdrive suppression and an
// optional modelled breath (design/study-2-spec.md, "I. Prelude", §C).
import { PITCH, both, deepFreeze, link, music, pace, sinusFocus, site, way, world } from './kit.js';

export const PRELUDE_BREATH = Object.freeze({ breathPeriodMs: 4000, depth: 0.05, targets: Object.freeze(['sinus']) });

// `breath: true` is the Breath toggle (world autonomic on). A live toggle needs a
// runtime command (engine request in docs/runs/studies-01.md).
export function createPreludeWorld({ breath = false } = {}) {
  const nodes = [
    site('S', 'sinus', 200, { automaticity: sinusFocus(800) }),
    site('A', 'atrial', 220, { restitution: [60, 80] }),
    site('N', 'nodal', 300, { restitution: [60, 120] }),
    site('H', 'hisPurkinje', 360, { restitution: [160, 200] }),
    site('V1', 'ventricular', 250, { restitution: [60, 80] }),
    site('V2', 'ventricular', 250, { restitution: [60, 80] }),
  ];
  const links = [
    // Atrial pacing enters the sinus node (SA is bidirectional), so a held tempo overdrives it.
    both('SA', 'S', 'A', 25),
    link('AN', 'A', 'N', way(35)),
    link('NH', 'N', 'H', way(60, { decrement: [140, 140] })),
    link('HV1', 'H', 'V1', way(40)),
    link('HV2', 'H', 'V2', way(35)),
  ];
  return world('prelude', nodes, links, breath ? { autonomic: { ...PRELUDE_BREATH, targets: [...PRELUDE_BREATH.targets] } } : {});
}

export const preludeWorld = deepFreeze(createPreludeWorld());

export const preludePresentation = deepFreeze({
  layout: {
    S: [-0.34, -0.92], A: [-0.10, -0.52], N: [0.22, -0.12],
    H: [0.04, 0.30], V1: [-0.58, 0.86], V2: [0.70, 0.80],
  },
  tiers: [['S'], ['A'], ['N'], ['H'], ['V1', 'V2']],
  staves: ['A', 'H', 'V1', 'V2'],
  music: music(preludeWorld.nodes, {
    A: [PITCH.D4, 'felt', -0.15],
    H: [PITCH.A5, 'glass', 0],
    V1: [PITCH.D3, 'bow', -0.22],
    V2: [PITCH.A3, 'bow', 0.22],
  }),
  protocols: [
    { id: 'hold-tempo', label: 'Hold a tempo', lab: 'Atrial overdrive pacing, 30 × 500 ms, then release (sinus node recovery)',
      commands: (startMs = 1000, cycleMs = 500, count = 30) => [pace('drive', startMs, 'A', cycleMs, count, `Atrial drive ${cycleMs} ms`)] },
  ],
});
