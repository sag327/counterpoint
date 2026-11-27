// Lab test worlds. Not study presets (those belong to src/worlds): these are
// the reference topologies the Lab oracles are stated against.

const link = (id, a, b, delayMs, decrement = null, both = true, extra = {}) => ({
  id, a, b, enabled: true,
  ab: { enabled: true, delayMs, decrement, ...extra },
  ba: { enabled: both, delayMs, decrement, ...extra },
});
const site = (id, erpMs, automaticity = null, extra = {}) => ({ id, erpMs, recoveryTailMs: 120, automaticity, ...extra });

// design/plates/src/echo.mjs as tuned for plates 1, 2, 4 and 6 (contract 1.0.0):
// fast pathway ERP 300, slow pathway delay 160, His ERP 250.
export function echoPlateWorld({ fp = 300, sl = 160, h = 250 } = {}) {
  return {
    worldId: 'echo-plate',
    nodes: [
      site('S', 200, { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true }),
      site('HRA', 230), site('CSp', 230), site('FP', fp), site('SP', 240), site('LCP', 250), site('H', h), site('V', 250),
    ],
    links: [
      link('SH', 'S', 'HRA', 25, null, false),
      link('HC', 'HRA', 'CSp', 30),
      link('CF', 'CSp', 'FP', 10),
      link('FL', 'FP', 'LCP', 30, { maxExtraMs: 30, tauMs: 100 }),
      link('CS', 'CSp', 'SP', 50),
      link('SL', 'SP', 'LCP', sl, { maxExtraMs: 60, tauMs: 120 }),
      link('LH', 'LCP', 'H', 40, null, false),
      link('HV', 'H', 'V', 35, null, false),
    ],
  };
}

// The Echo table of the spec ("II. Echo") as a contract 1.1.0 world: tissue,
// restitution, entry slowing and sinus overdrive.
export function echoV11World() {
  const r = (erpMaxMs, amplitudeMs, tauMs) => ({ restitution: { erpMaxMs, amplitudeMs, tauMs, erpMinMs: Math.max(50, erpMaxMs - amplitudeMs - 40) } });
  const entry = (maxExtraMs, tauMs) => ({ entry: { maxExtraMs, tauMs } });
  return {
    contractVersion: '1.1.0',
    worldId: 'echo-v11',
    nodes: [
      site('S', 200, { cycleMs: 800, firstAttemptMs: 0, resetOnCapture: true, overdrive: { gainPerBeat: 0.06, maxMs: 450, warmupFactor: 0.6 } }, { tissue: 'sinus', audible: false }),
      site('HRA', 230, null, { tissue: 'atrial', ...r(230, 60, 80) }),
      site('CSp', 230, null, { tissue: 'atrial', ...r(230, 60, 80) }),
      site('FP', 300, null, { tissue: 'nodal', audible: false, ...r(300, 60, 120) }),
      site('SP', 240, null, { tissue: 'nodal', audible: false, ...r(240, 40, 100) }),
      site('LCP', 250, null, { tissue: 'nodal', audible: false, ...r(250, 60, 120) }),
      site('H', 360, null, { tissue: 'hisPurkinje', ...r(360, 140, 150) }),
      site('V', 250, null, { tissue: 'ventricular', ...r(250, 60, 80) }),
    ],
    links: [
      link('SH', 'S', 'HRA', 25, null, false),
      link('HC', 'HRA', 'CSp', 30, null, true, entry(15, 40)),
      link('CF', 'CSp', 'FP', 10, null, true, entry(20, 60)),
      link('FL', 'FP', 'LCP', 30, { maxExtraMs: 30, tauMs: 100 }, true, entry(20, 60)),
      link('CS', 'CSp', 'SP', 50, null, true, entry(20, 60)),
      link('SL', 'SP', 'LCP', 160, { maxExtraMs: 60, tauMs: 120 }, true, entry(30, 80)),
      link('LH', 'LCP', 'H', 40, null, false, entry(10, 40)),
      link('HV', 'H', 'V', 35, null, false, entry(10, 40)),
    ],
  };
}

export const ECHO_SITES = { atrium: 'CSp', fastPathway: 'FP', slowPathway: 'SP', his: 'H', ventricle: 'V' };
export const ECHO_LABELS = { CSp: 'atrial', FP: 'fast pathway', SP: 'slow pathway', LCP: 'lower common pathway', H: 'His', V: 'ventricle' };
