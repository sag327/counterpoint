// Scenes for the view tests: an Echo-like v1.1 world (design/plates/src/echo.mjs) run on the real engine,
// plus a small concealed-chain scene. World and commands only; no recorded expectations.
import { createEngine } from '../src/engine/index.js';

const dl = (id, a, b, d, dec = null, both = true) => ({ id, a, b, enabled: true,
  ab: { enabled: true, delayMs: d, decrement: dec }, ba: { enabled: both, delayMs: d, decrement: dec } });
const N = (id, erp, extra = {}) => ({ id, erpMs: erp, recoveryTailMs: 120, automaticity: null, ...extra });

export function echoWorld({ fp = 300, sp = 160, sl = 180 } = {}) {
  const nodal = { tissue: 'nodal', audible: false };
  return {
    contractVersion: '1.1.0', worldId: 'echo',
    nodes: [
      N('S', 200, { tissue: 'sinus', automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true } }),
      N('HRA', 230), N('CSp', 230), N('FP', fp, nodal), N('SP', sp, nodal), N('LCP', 250, nodal),
      N('H', 250, { tissue: 'hisPurkinje' }), N('V', 250, { tissue: 'ventricular' }),
    ],
    links: [dl('SH', 'S', 'HRA', 25, null, false), dl('HC', 'HRA', 'CSp', 30), dl('CF', 'CSp', 'FP', 10),
      dl('FL', 'FP', 'LCP', 30, { maxExtraMs: 30, tauMs: 100 }), dl('CS', 'CSp', 'SP', 50),
      dl('SL', 'SP', 'LCP', sl, { maxExtraMs: 60, tauMs: 120 }), dl('LH', 'LCP', 'H', 40, null, false), dl('HV', 'H', 'V', 35, null, false)],
  };
}
export const echoTiers = [
  { id: 'HRA', label: 'High atrium', sites: ['HRA'] }, { id: 'CSp', label: 'Septal atrium', sites: ['CSp'] },
  { id: 'FP', label: 'Fast pathway', group: 'av', audible: false, sites: ['FP'] }, { id: 'SP', label: 'Slow pathway', group: 'av', audible: false, sites: ['SP'] },
  { id: 'LCP', label: 'Lower node', group: 'av', audible: false, sites: ['LCP'] }, { id: 'H', label: 'His', sites: ['H'] },
  { id: 'V', label: 'Ventricle', sites: ['V'] },
];
export const echoStaves = [
  { nodeId: 'HRA', label: 'High atrium', tissue: 'atrial', pitch: 'D4' },
  { nodeId: 'H', label: 'His', tissue: 'hisPurkinje', pitch: 'A5' },
  { nodeId: 'CSp', label: 'Septal atrium', tissue: 'atrial', pitch: 'F4' },
  { nodeId: 'V', label: 'Ventricle', tissue: 'ventricular', pitch: 'D3' },
];

// Eight drive pulses at 600 ms from CSp, then a premature touch 270 ms after the last: block in FP, jump, circulation.
export const ECHO_LAST_DRIVE = 200 + 600 * 7;
export const ECHO_S2 = ECHO_LAST_DRIVE + 270;
export function runEcho(throughMs = ECHO_S2 + 3000, world = echoWorld()) {
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(world, 'r');
  engine.enqueue({ commandId: 'drive', runId: 'r', type: 'stimulateTrain', nodeId: 'CSp', startMs: 200, cycleMs: 600, count: 8, label: 'drive', tMs: 0 });
  engine.enqueue({ commandId: 's2', runId: 'r', type: 'stimulate', nodeId: 'CSp', tMs: ECHO_S2 });
  return engine.advanceTo(throughMs);
}

// Three-site silent nodal chain A -> N1 -> N2 -> N3 -> H (spec §E), paced at 300 ms: Wenckebach, blocks at N3 are concealed.
export function chainWorld() {
  const nodal = { tissue: 'nodal', audible: false };
  const one = (delayMs, dec = null) => ({ enabled: true, delayMs, decrement: dec });
  const off = (delayMs) => ({ enabled: false, delayMs, decrement: null });
  const join = (id, a, b, ab) => ({ id, a, b, enabled: true, ab, ba: off(ab.delayMs) });
  return {
    contractVersion: '1.1.0', worldId: 'chain',
    nodes: [N('A', 200, { tissue: 'atrial' }), N('N1', 200, nodal), N('N2', 220, nodal), N('N3', 260, nodal), N('H', 250, { tissue: 'hisPurkinje' })],
    links: [join('AN1', 'A', 'N1', one(30)), join('N12', 'N1', 'N2', one(40, { maxExtraMs: 30, tauMs: 100 })),
      join('N23', 'N2', 'N3', one(50, { maxExtraMs: 40, tauMs: 100, })), join('N3H', 'N3', 'H', one(30))]
      .map((l) => (l.id === 'N23' ? { ...l, ab: { ...l.ab, entry: { maxExtraMs: 60, tauMs: 60 } } } : l)),
  };
}
export function runChain(throughMs = 3000) {
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(chainWorld(), 'c');
  engine.enqueue({ commandId: 'p', runId: 'c', type: 'stimulateTrain', nodeId: 'A', startMs: 0, cycleMs: 300, count: 8, label: 'pace', tMs: 0 });
  return engine.advanceTo(throughMs);
}

// 10-site ring (24 ms links, 45 ms isthmus) feeding a silent nodal chain, His and ventricle (design/plates/src/ost.mjs).
export function ostinatoWorld() {
  const dir = (d, dec = null, on = true) => ({ enabled: on, delayMs: d, decrement: dec });
  const link = (id, a, b, d, dec = null, both = true) => ({ id, a, b, enabled: true, ab: dir(d, dec), ba: dir(d, dec, both) });
  const nodes = []; const links = [];
  for (let i = 0; i < 10; i += 1) { nodes.push(N(`R${i}`, 170)); links.push(link(`L${i}`, `R${i}`, `R${(i + 1) % 10}`, i === 4 ? 45 : 24)); }
  const nodal = { tissue: 'nodal', audible: false };
  nodes.push(N('N1', 260, nodal), N('N2', 280, nodal), N('N3', 300, nodal), N('H', 260, { tissue: 'hisPurkinje' }), N('V', 250, { tissue: 'ventricular' }));
  links.push(link('RN', 'R0', 'N1', 20, null, false), link('N12', 'N1', 'N2', 30, { maxExtraMs: 40, tauMs: 100 }, false),
    link('N23', 'N2', 'N3', 30, { maxExtraMs: 60, tauMs: 120 }, false), link('N3H', 'N3', 'H', 30, null, false), link('HV', 'H', 'V', 35, null, false));
  return { contractVersion: '1.1.0', worldId: 'ostinato', nodes, links };
}
export function runOstinato(throughMs = 3000) {
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(ostinatoWorld(), 'o');
  engine.enqueue({ commandId: 'c1', runId: 'o', type: 'setLinkEnabled', linkId: 'L9', enabled: false, tMs: 0 });
  engine.enqueue({ commandId: 'c2', runId: 'o', type: 'stimulate', nodeId: 'R0', tMs: 10 });
  engine.enqueue({ commandId: 'c3', runId: 'o', type: 'setLinkEnabled', linkId: 'L9', enabled: true, tMs: 120 });
  return engine.advanceTo(throughMs);
}

// Circulation as a 1.1.0 world: S1-S2 induction, a lesion on L3, then a stimulus beside the line (spec §F).
import { createCirculationWorld } from '../src/worlds/circulation.js';
export function runLesionRing(throughMs = 9000) {
  const world = createCirculationWorld();
  world.contractVersion = '1.1.0';
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(world, 'l');
  const cmds = [
    { commandId: 'S1', type: 'stimulate', nodeId: 'R0', tMs: 0 }, { commandId: 'S2', type: 'stimulate', nodeId: 'R0', tMs: 240 },
    { commandId: 'abl', type: 'ablate', target: 'L3', durationMs: 2000, completeness: 1, tMs: 1000 },
    { commandId: 'probe', type: 'stimulate', nodeId: 'R3', tMs: 6000 },
  ];
  for (const c of cmds) engine.enqueue({ runId: 'l', ...c });
  return { world, events: engine.advanceTo(throughMs) };
}

// Hemiola: Duality with B protected and coupled from A (spec §D), for phase_modulated arcs.
import { createDualityWorld } from '../src/worlds/duality.js';
export function runHemiola(throughMs = 6000) {
  const world = createDualityWorld();
  world.contractVersion = '1.1.0';
  world.nodes.find((n) => n.id === 'B').automaticity.protected = true;
  world.coupling = [{ id: 'AB', from: 'A', to: 'B', amplitude: 0.17 }];
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(world, 'h');
  return { world, events: engine.advanceTo(throughMs) };
}

// Fusion: a stimulus meets the circulating wave at R1 on the same tick (mixed-source capture).
export function runFusion() {
  const world = createCirculationWorld();
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(world, 'f');
  engine.enqueue({ runId: 'f', commandId: 'a', type: 'stimulate', nodeId: 'R0', tMs: 0 });
  engine.enqueue({ runId: 'f', commandId: 'b', type: 'stimulate', nodeId: 'R1', tMs: 60 });
  return { world, events: engine.advanceTo(600) };
}

// Entrainment: pace an Ostinato circulation 11 ms faster than its 261 ms cycle for eight beats, then release.
export function runEntrainment(cycleMs = 250) {
  const world = ostinatoWorld();
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(world, 'e');
  const cmds = [
    { commandId: 'c1', type: 'setLinkEnabled', linkId: 'L9', enabled: false, tMs: 0 },
    { commandId: 'c2', type: 'stimulate', nodeId: 'R0', tMs: 10 },
    { commandId: 'c3', type: 'setLinkEnabled', linkId: 'L9', enabled: true, tMs: 120 },
    { commandId: 'pace', type: 'stimulateTrain', nodeId: 'R0', startMs: 2594, cycleMs, count: 8, label: 'pace', tMs: 1000 },
  ];
  for (const c of cmds) engine.enqueue({ runId: 'e', ...c });
  return { world, events: engine.advanceTo(6000) };
}
