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
