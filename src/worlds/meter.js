// III. Meter — Wenckebach periodicity in a silent three-site nodal chain, against
// infranodal 2:1 block in "Sudden" (design/study-2-spec.md, "III. Meter").
// G1 correction 3: progression needs §B entry slowing on the chain, not decrement alone.
import { PITCH, deepFreeze, link, music, pace, sinusFocus, site, both, way, world } from './kit.js';

export const METER_CHAIN = deepFreeze({
  erp: { N1: 280, N2: 300, N3: 300 },
  restitution: { N1: [40, 120], N2: [40, 120], N3: [40, 120] },
  delay: { AN1: 30, N12: 40, N23: 50, N3H: 30 },
  decrement: { N12: [30, 100], N23: [40, 100] },
  entry: { N12: [30, 80], N23: [125, 100] },
});

// The nodal chain as a reusable fragment (Ostinato and Retrograde reuse it).
// `from` is the atrial site feeding N1; `to` is the His site.
export function meterChain(from, to, { prefix = '', chain = METER_CHAIN } = {}) {
  const c = chain;
  const id = name => `${prefix}${name}`;
  const nodes = ['N1', 'N2', 'N3'].map(n => site(id(n), 'nodal', c.erp[n], { restitution: [...c.restitution[n]] }));
  const links = [
    link(id('AN1'), from, id('N1'), way(c.delay.AN1)),
    link(id('N12'), id('N1'), id('N2'), way(c.delay.N12, { decrement: [...c.decrement.N12], entry: [...c.entry.N12] })),
    link(id('N23'), id('N2'), id('N3'), way(c.delay.N23, { decrement: [...c.decrement.N23], entry: [...c.entry.N23] })),
    link(id('N3H'), id('N3'), to, way(c.delay.N3H)),
  ];
  return { nodes, links };
}

// `sudden: true` is the "Sudden" mode: His ERP 420 ms (infranodal 2:1, no prolongation).
export function createMeterWorld({ sudden = false } = {}) {
  const chain = meterChain('HRA', 'H');
  const nodes = [
    site('S', 'sinus', 200, { automaticity: sinusFocus(800) }),
    site('HRA', 'atrial', 220, { restitution: [60, 80] }),
    ...chain.nodes,
    sudden ? site('H', 'hisPurkinje', 420) : site('H', 'hisPurkinje', 360, { restitution: [160, 200] }),
    site('V', 'ventricular', 250, { restitution: [60, 80] }),
  ];
  const links = [both('SH', 'S', 'HRA', 25), ...chain.links, link('HV', 'H', 'V', way(40))];
  return world('meter', nodes, links);
}

export const meterWorld = deepFreeze(createMeterWorld());

export const meterPresentation = deepFreeze({
  layout: {
    S: [-0.70, -0.80], HRA: [-0.44, -0.50], N1: [-0.12, -0.30], N2: [0.16, -0.10],
    N3: [0.38, 0.14], H: [0.18, 0.46], V: [-0.20, 0.84],
  },
  tiers: [['S', 'HRA'], ['N1'], ['N2'], ['N3'], ['H'], ['V']],
  staves: ['HRA', 'H', 'V'],
  music: music(meterWorld.nodes, {
    HRA: [PITCH.D4, 'felt', -0.2],
    H: [PITCH.A5, 'glass', 0],
    V: [PITCH.D3, 'bow', 0.15],
  }),
  protocols: [
    { id: 'hold-tempo', label: 'Hold a tempo', lab: 'Incremental atrial pacing (one drive cycle per run)',
      cycles: [600, 450, 400, 360, 330, 300],
      commands: (cycleMs, count = 40, startMs = 1000) => [pace('drive', startMs, 'HRA', cycleMs, count, `Atrial drive ${cycleMs} ms`)] },
  ],
});
