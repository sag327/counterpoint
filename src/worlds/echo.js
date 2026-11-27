// II. Echo — dual AV-nodal pathways (design/study-2-spec.md, "II. Echo").
// A fast pathway with a long ERP and a slow pathway with a short ERP join at a
// silent lower common pathway. Everything below is topology and tissue law.
import { PITCH, both, deepFreeze, link, music, pace, sinusFocus, site, stim, way, world } from './kit.js';

export const ECHO_PARAMETERS = Object.freeze({
  drive: { site: 'CSp', cycleMs: 600, count: 8 },
});

export function createEchoWorld() {
  const nodes = [
    site('S', 'sinus', 200, { automaticity: sinusFocus(800) }),
    site('HRA', 'atrial', 230, { restitution: [60, 80] }),
    site('CSp', 'atrial', 230, { restitution: [60, 80] }),
    site('FP', 'nodal', 304, { restitution: [60, 120] }),
    site('SP', 'nodal', 240, { restitution: [40, 100] }),
    site('LCP', 'nodal', 250, { restitution: [60, 120] }),
    site('H', 'hisPurkinje', 360, { restitution: [160, 200] }),
    site('V', 'ventricular', 250, { restitution: [60, 80] }),
  ];
  const links = [
    // Sinus exit to the high atrium; atrial pacing also enters the sinus node and resets it.
    both('SH', 'S', 'HRA', 25),
    both('HC', 'HRA', 'CSp', 30, { entry: [15, 40] }),
    both('CF', 'CSp', 'FP', 10, { entry: [20, 60] }),
    both('FL', 'FP', 'LCP', 30, { decrement: [30, 100], entry: [20, 60] }),
    both('CS', 'CSp', 'SP', 50, { entry: [20, 60] }),
    both('SL', 'SP', 'LCP', 100, { decrement: [60, 120], entry: [30, 80] }),
    link('LH', 'LCP', 'H', way(55, { entry: [10, 40] })),
    link('HV', 'H', 'V', way(35, { entry: [10, 40] })),
  ];
  return world('echo', nodes, links);
}

export const echoWorld = deepFreeze(createEchoWorld());

const DRIVE_START_MS = 200;
const lastS1Ms = ({ drive = 600, count = 8, start = DRIVE_START_MS } = {}) => start + drive * (count - 1);

// Guided runs (creator decision 2026-11-27): one press shows the behaviour. The
// model is nominal, the drive runs silently, and presentation starts 100 ms
// before the decisive S2. With the nominal model, S2 240–264 ms gives exactly
// one echo and S2 266–298 ms sustained AV-nodal reentry (tests/studies-echo.test.js);
// each button uses the middle of its window.
export const ECHO_S2_MS = 252;
export const ARRHYTHMIA_S2_MS = 282;
export const GUIDED_LEAD_MS = 100;
export const s2AtMs = s2 => lastS1Ms() + s2;

const S1S2 = (s2, { drive = 600, count = 8, start = DRIVE_START_MS, s3 = null } = {}) => {
  const last = lastS1Ms({ drive, count, start });
  const commands = [pace('S1', start, 'CSp', drive, count, `S1 drive ${drive} ms`), stim('S2', last + s2, 'CSp')];
  if (s3 !== null) commands.push(stim('S3', last + s2 + s3, 'CSp'));
  return commands;
};

export const echoPresentation = deepFreeze({
  layout: {
    S: [-0.62, -0.86], HRA: [-0.30, -0.62], CSp: [0.10, -0.40],
    FP: [0.42, -0.08], SP: [-0.22, 0.02], LCP: [0.12, 0.30],
    H: [0.02, 0.58], V: [0.30, 0.90],
  },
  tiers: [['S', 'HRA', 'CSp'], ['FP'], ['SP'], ['LCP'], ['H'], ['V']],
  staves: ['HRA', 'H', 'CSp', 'V'],
  music: music(echoWorld.nodes, {
    HRA: [PITCH.D4, 'felt', -0.2],
    CSp: [PITCH.F4, 'pluck', 0.1],
    H: [PITCH.A5, 'glass', 0],
    V: [PITCH.D3, 'bow', 0.15],
  }),
  protocols: [
    { id: 'find-echo', label: 'Find the echo', lab: `S1 600 ms × 8 from CSp, S2 ${ECHO_S2_MS} ms: one AV-nodal echo`,
      s2: ECHO_S2_MS, presentFromMs: s2AtMs(ECHO_S2_MS) - GUIDED_LEAD_MS, commands: (s2 = ECHO_S2_MS) => S1S2(s2) },
    { id: 'find-arrhythmia', label: 'Find the arrhythmia', lab: `S1 600 ms × 8 from CSp, S2 ${ARRHYTHMIA_S2_MS} ms: sustained AV-nodal reentry`,
      s2: ARRHYTHMIA_S2_MS, presentFromMs: s2AtMs(ARRHYTHMIA_S2_MS) - GUIDED_LEAD_MS, commands: (s2 = ARRHYTHMIA_S2_MS) => S1S2(s2) },
  ],
});
