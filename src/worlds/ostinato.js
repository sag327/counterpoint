// IV. Ostinato — a macroreentrant atrial ring filtered by a silent nodal chain
// (design/study-2-spec.md, "IV. Ostinato"). Reentry is induced only by stimuli:
// R9 has the longest rested ERP, so an early S2 at R0 blocks toward R9 and
// conducts the long way round (unidirectional block from heterogeneous refractoriness).
import { PITCH, both, deepFreeze, link, music, stim, site, way, world, pace } from './kit.js';
import { meterChain } from './meter.js';

export const OSTINATO_RING = deepFreeze({
  sites: 10, delayMs: 24, isthmus: { id: 'L4', delayMs: 45 },
  erpMs: 190, restitution: [70, 60], slowSite: { id: 'R9', erpMs: 280, restitution: [120, 80] },
  entry: [6, 40],
  bystander: { id: 'X', from: 'R3', delayMs: 50 },
});

// The ring's own nodal filter: Meter's chain with lighter entry slowing, so the
// chain conducts 2:1 at the flutter cycle and 1:1 once Slow lengthens it.
export const OSTINATO_CHAIN = deepFreeze({
  erp: { N1: 260, N2: 270, N3: 280 },
  restitution: { N1: [40, 120], N2: [40, 120], N3: [40, 120] },
  delay: { AN1: 30, N12: 40, N23: 50, N3H: 30 },
  decrement: { N12: [30, 100], N23: [40, 100] },
  entry: { N12: [20, 80], N23: [40, 100] },
});

export function createOstinatoWorld() {
  const r = OSTINATO_RING;
  const nodes = [];
  const links = [];
  for (let i = 0; i < r.sites; i++) {
    const slow = r.slowSite.id === `R${i}`;
    nodes.push(site(`R${i}`, 'atrial', slow ? r.slowSite.erpMs : r.erpMs, { restitution: slow ? [...r.slowSite.restitution] : [...r.restitution] }));
    const id = `L${i}`;
    links.push(both(id, `R${i}`, `R${(i + 1) % r.sites}`, id === r.isthmus.id ? r.isthmus.delayMs : r.delayMs, { entry: [...r.entry] }));
  }
  nodes.push(site(r.bystander.id, 'atrial', r.erpMs, { restitution: [...r.restitution] }));
  links.push(both('LX', r.bystander.from, r.bystander.id, r.bystander.delayMs, { entry: [...r.entry] }));
  const chain = meterChain('R0', 'H', { chain: OSTINATO_CHAIN });
  nodes.push(...chain.nodes,
    site('H', 'hisPurkinje', 360, { restitution: [160, 200] }),
    site('RB', 'hisPurkinje', 400, { restitution: [160, 200] }),
    site('LB', 'hisPurkinje', 340, { restitution: [160, 200] }),
    site('V', 'ventricular', 250, { restitution: [60, 80] }));
  links.push(...chain.links,
    link('HRB', 'H', 'RB', way(10)), link('HLB', 'H', 'LB', way(10)),
    link('RBV', 'RB', 'V', way(30)), link('LBV', 'LB', 'V', way(25)));
  return world('ostinato', nodes, links);
}

export const ostinatoWorld = deepFreeze(createOstinatoWorld());

const ring = Array.from({ length: 10 }, (_, i) => `R${i}`);
const ringLayout = Object.fromEntries(ring.map((id, i) => {
  const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 10;
  return [id, [Math.round(0.62 * Math.cos(angle) * 100) / 100 - 0.18, Math.round(0.62 * Math.sin(angle) * 100) / 100 - 0.12]];
}));

const RING_PITCH = [PITCH.D5, PITCH.C5, PITCH.A4, PITCH.G4, PITCH.F4, PITCH.D4, PITCH.F4, PITCH.G4, PITCH.A4, PITCH.C5];

export const ostinatoPresentation = deepFreeze({
  layout: {
    ...ringLayout,
    X: [0.78, -0.30],
    N1: [-0.02, 0.62], N2: [0.20, 0.70], N3: [0.42, 0.74],
    H: [0.60, 0.70], RB: [0.80, 0.62], LB: [0.74, 0.86], V: [0.92, 0.94],
  },
  tiers: [...ring.map(id => [id]), ['X'], ['N1'], ['N2'], ['N3'], ['H'], ['RB', 'LB'], ['V']],
  staves: [...ring, 'X', 'H', 'RB', 'LB', 'V'],
  music: music(ostinatoWorld.nodes, {
    ...Object.fromEntries(ring.map((id, i) => [id, [RING_PITCH[i], i % 2 === 0 ? 'felt' : 'pluck', Math.round(Math.cos((i * 2 * Math.PI) / 10) * 50) / 100]])),
    X: [PITCH.E5, 'pluck', 0.6],
    H: [PITCH.A5, 'glass', 0.1],
    RB: [PITCH.C6, 'glass', 0.25],
    LB: [PITCH.D6, 'glass', -0.05],
    V: [PITCH.D3, 'bow', 0.1],
  }),
  protocols: [
    { id: 'start-figure', label: 'Start the figure', lab: 'S1–S2 at R0 (unidirectional block toward R9)',
      commands: (s2 = 210, startMs = 100) => [stim('S1', startMs, 'R0'), stim('S2', startMs + s2, 'R0')] },
    { id: 'entrain', label: 'Hold a tempo on the circle', lab: 'Entrainment: pace at TCL − 20 ms, then measure PPI − TCL',
      commands: (nodeId, startMs, cycleMs, count = 12) => [pace(`entrain-${nodeId}`, startMs, nodeId, cycleMs, count, `Entrainment from ${nodeId} at ${cycleMs} ms`)] },
  ],
});
