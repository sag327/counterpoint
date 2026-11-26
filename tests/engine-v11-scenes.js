// Contract 1.1.0 oracle scenes. Worlds and commands only: expected values are
// derived independently in engine-v11.test.js, never recorded from the engine.
import { createEngine } from '../src/engine/index.js';
import { createCirculationWorld } from '../src/worlds/circulation.js';
import { createDualityWorld } from '../src/worlds/duality.js';

export const V11 = '1.1.0';

export const site = (id, erpMs, extra = {}) => ({ id, erpMs, recoveryTailMs: 120, automaticity: null, ...extra });
export const way = (delayMs, extra = {}) => ({ enabled: true, delayMs, decrement: null, ...extra });
export const off = delayMs => ({ enabled: false, delayMs, decrement: null });
export const join = (id, a, b, ab, ba = off(ab.delayMs)) => ({ id, a, b, enabled: true, ab, ba });
export const v11World = (worldId, nodes, links = [], extra = {}) => ({ contractVersion: V11, worldId, nodes, links, ...extra });

export const train = (commandId, tMs, nodeId, startMs, cycleMs, count, label = 'drive') =>
  ({ commandId, tMs, type: 'stimulateTrain', nodeId, startMs, cycleMs, count, label });
export const pulseAt = (commandId, tMs, nodeId) => ({ commandId, tMs, type: 'stimulate', nodeId });

export function play(world, runId, commands, horizons, options = { processingBudget: 10_000_000 }) {
  const engine = createEngine(options);
  const initial = engine.reset(world, runId);
  for (const command of commands) engine.enqueue({ runId, ...command });
  const events = horizons.flatMap(horizon => engine.advanceTo(horizon));
  return { engine, initial, events };
}

// §A: one site with E_max 300, A 200, tau 60 driven at a fixed cycle.
export const restitutionLaw = { erpMaxMs: 300, amplitudeMs: 200, tauMs: 60, erpMinMs: 50 };
export const restitutionWorld = () => v11World('restitution', [site('A', 300, { restitution: { ...restitutionLaw } })]);

// §C: an 800 ms sinus focus with overdrive g 0.06, S_max 450, w 0.6.
export const overdriveLaw = { gainPerBeat: 0.06, maxMs: 450, warmupFactor: 0.6 };
export const focusWorld = ({ resetOnCapture = true, overdrive = { ...overdriveLaw }, erpMs = 200, tissue = 'sinus', autonomic } = {}) =>
  v11World('focus', [site('S', erpMs, {
    tissue,
    automaticity: { cycleMs: 800, firstAttemptMs: 0, resetOnCapture, overdrive },
  })], [], autonomic === undefined ? {} : { autonomic });

// §B: eight sites, 35 ms links, restitution (220, 80, 60) and entry 20/60.
// L3 conducts R3 -> R4 only, so one stimulus at R4 starts a single circulating wave.
export const ENTRY_RING = { delayMs: 35, entry: { maxExtraMs: 20, tauMs: 60 }, restitution: { erpMaxMs: 220, amplitudeMs: 80, tauMs: 60, erpMinMs: 100 } };
export function entryRingWorld({ entry = ENTRY_RING.entry } = {}) {
  const nodes = [];
  const links = [];
  for (let i = 0; i < 8; i++) {
    nodes.push(site(`R${i}`, 220, { restitution: { ...ENTRY_RING.restitution } }));
    const direction = enabled => ({ enabled, delayMs: ENTRY_RING.delayMs, decrement: null, entry: entry === null ? null : { ...entry } });
    links.push({ id: `L${i}`, a: `R${i}`, b: `R${(i + 1) % 8}`, enabled: true, ab: direction(true), ba: direction(i !== 3) });
  }
  return v11World('entry-ring', nodes, links);
}

// §D: Duality with B protected and coupled from A.
export function hemiolaWorld(amplitude) {
  const world = createDualityWorld();
  world.contractVersion = V11;
  world.nodes.find(node => node.id === 'B').automaticity.protected = true;
  world.coupling = [{ id: 'AB', from: 'A', to: 'B', amplitude }];
  return world;
}

// §E: atrium, a three-site silent nodal chain and His. Entry slowing into N3 only.
export const CHAIN = {
  erp: { A: 200, N1: 200, N2: 220, N3: 260, H: 250 },
  delay: { AN1: 30, N12: 40, N23: 50, N3H: 30 },
  decrement: { N12: { maxExtraMs: 30, tauMs: 100 }, N23: { maxExtraMs: 40, tauMs: 100 } },
  entry: { maxExtraMs: 60, tauMs: 60 },
};
export function chainWorld() {
  const { erp, delay, decrement, entry } = CHAIN;
  const nodal = { tissue: 'nodal', audible: false };
  return v11World('nodal-chain', [
    site('A', erp.A, { tissue: 'atrial' }),
    site('N1', erp.N1, nodal),
    site('N2', erp.N2, nodal),
    site('N3', erp.N3, nodal),
    site('H', erp.H, { tissue: 'hisPurkinje' }),
  ], [
    join('AN1', 'A', 'N1', way(delay.AN1)),
    join('N12', 'N1', 'N2', way(delay.N12, { decrement: { ...decrement.N12 } })),
    join('N23', 'N2', 'N3', way(delay.N23, { decrement: { ...decrement.N23 }, entry: { ...entry } })),
    join('N3H', 'N3', 'H', way(delay.N3H)),
  ]);
}

// §F: the production ring as a 1.1.0 world, induced with the v0.1 S1-S2 protocol.
export function lesionRingWorld() {
  const world = createCirculationWorld();
  world.contractVersion = V11;
  return world;
}
export const induction = [pulseAt('S1', 0, 'R0'), pulseAt('S2', 240, 'R0')];
export const ablate = (commandId, tMs, target, durationMs, completeness) => ({ commandId, tMs, type: 'ablate', target, durationMs, completeness });
