// II. Echo — dual AV-nodal pathways (design/study-2-spec.md, "II. Echo").
// A fast pathway with a long ERP and a slow pathway with a short ERP join at a
// silent lower common pathway. Everything below is topology and tissue law.
import { PITCH, both, deepFreeze, music, pace, site, stim, world } from './kit.js';

export const ECHO_PARAMETERS = Object.freeze({
  drive: Object.freeze({ site: 'S', cycleMs: 600, count: 8 }),
});

export function createEchoWorld() {
  const nodes = [
    site('S', 'sinus', 200),
    site('HRA', 'atrial', 230, { restitution: [60, 80] }),
    site('CSp', 'atrial', 230, { restitution: [60, 80] }),
    site('FP', 'nodal', 304, { restitution: [60, 120] }),
    site('SP', 'nodal', 240, { restitution: [40, 100] }),
    site('LCP', 'nodal', 250, { restitution: [60, 120] }),
    site('H', 'hisPurkinje', 360, { restitution: [160, 200] }),
    site('V', 'ventricular', 250, { restitution: [60, 80] }),
  ];
  const links = [
    // First paced site to the high atrium, with a path for retrograde conduction.
    both('SH', 'S', 'HRA', 25),
    both('HC', 'HRA', 'CSp', 30, { entry: [15, 40] }),
    both('CF', 'CSp', 'FP', 10, { entry: [20, 60] }),
    both('FL', 'FP', 'LCP', 30, { decrement: [30, 100], entry: [20, 60] }),
    both('CS', 'CSp', 'SP', 50, { entry: [20, 60] }),
    both('SL', 'SP', 'LCP', 100, { decrement: [60, 120], entry: [30, 80] }),
    both('LH', 'LCP', 'H', 55, { entry: [10, 40] }),
    both('HV', 'H', 'V', 35, { entry: [10, 40] }),
  ];
  return world('echo', nodes, links);
}

export const echoWorld = deepFreeze(createEchoWorld());

const DRIVE_START_MS = 200;
const { site: driveSite, cycleMs: driveCycleMs, count: driveCount } = ECHO_PARAMETERS.drive;
const lastS1Ms = DRIVE_START_MS + driveCycleMs * (driveCount - 1);

// Guided runs (creator decision 2026-11-27): one press shows the behaviour. The
// model is nominal, the drive runs silently, and presentation starts 100 ms
// before the decisive S2. With pacing at S, S2 230–256 ms gives exactly
// one echo and S2 257–296 ms sustained AV-nodal reentry (tests/studies-echo.test.js);
// each button uses the middle of its window.
export const ECHO_S2_MS = 243;
export const ARRHYTHMIA_S2_MS = 277;
export const GUIDED_LEAD_MS = 100;
export const s2AtMs = s2 => lastS1Ms + s2;

const S1S2 = s2 => [
  pace('S1', DRIVE_START_MS, driveSite, driveCycleMs, driveCount, `S1 drive ${driveCycleMs} ms`),
  stim('S2', s2AtMs(s2), driveSite),
];

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
    { id: 'find-echo', label: 'Find the echo', lab: `S1 ${driveCycleMs} ms × ${driveCount} from ${driveSite}, S2 ${ECHO_S2_MS} ms: one AV-nodal echo`,
      s2: ECHO_S2_MS, presentFromMs: s2AtMs(ECHO_S2_MS) - GUIDED_LEAD_MS, commands: (s2 = ECHO_S2_MS) => S1S2(s2) },
    { id: 'find-arrhythmia', label: 'Find the arrhythmia', lab: `S1 ${driveCycleMs} ms × ${driveCount} from ${driveSite}, S2 ${ARRHYTHMIA_S2_MS} ms: sustained AV-nodal reentry`,
      s2: ARRHYTHMIA_S2_MS, presentFromMs: s2AtMs(ARRHYTHMIA_S2_MS) - GUIDED_LEAD_MS, commands: (s2 = ARRHYTHMIA_S2_MS) => S1S2(s2) },
  ],
});
