import { createEngine } from '../../engine/index.js';
import { createCirculationWorld } from '../../worlds/circulation.js';

export const HORIZON = 3600;
export function createWeaveTrace(coupling = 240) {
  const world = createCirculationWorld();
  world.nodes.forEach((node, i) => { node.erpMs = i >= 1 && i <= 3 ? 300 : 200; });
  const engine = createEngine();
  const runId = 'weave';
  engine.reset(world, runId);
  engine.enqueue({ commandId: 's1', runId, type: 'stimulate', nodeId: 'R0', tMs: 0 });
  if (coupling !== null) engine.enqueue({ commandId: 's2', runId, type: 'stimulate', nodeId: 'R0', tMs: coupling });
  const events = engine.advanceTo(HORIZON);
  return { engine, events, world };
}

// Geometry follows ERP, not the engine's separate post-ERP recovery tail.
export function openingAt(node, time) {
  if (node.excitable || node.lastActivationMs === null) return 0;
  return Math.pow(Math.max(0, Math.min(1, (node.refractoryUntilMs - time) / node.erpMs)), 0.55);
}
