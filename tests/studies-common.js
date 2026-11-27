// Shared helpers for the Study No. 2 study oracles (tests/studies-*.test.js).
// Expected values are recomputed here from the contract 1.1.0 laws using only
// event fields and world parameters, never read back from engine state.
import assert from 'node:assert/strict';
import { createEngine } from '../src/engine/index.js';

export const RUN = 'study';
export const tick = ms => Math.round(ms * 1000);

export function play(world, commands, horizonMs, options = {}) {
  const engine = createEngine({ processingBudget: 100_000_000, historyBatches: 64, ...options });
  engine.reset(world, RUN);
  for (const command of commands) engine.enqueue({ runId: RUN, ...command });
  return engine.advanceTo(horizonMs);
}

export const ofType = (events, type) => events.filter(event => event.type === type);
export const acts = (events, nodeId) => events.filter(e => e.type === 'activation' && (nodeId === undefined || e.nodeId === nodeId));
export const blocked = (events, nodeId) => events.filter(e => e.type === 'activation_blocked' && (nodeId === undefined || e.nodeId === nodeId));
export const times = (events, nodeId) => acts(events, nodeId).map(e => e.tMs);
export const diffs = values => values.slice(1).map((value, i) => value - values[i]);
export const after = (events, tMs) => events.filter(e => e.tMs >= tMs);

// Every capture's ERP lies on its §A law, and every launch's delay parts follow
// the v1.0 decrement law (source DI) and the §B entry law (destination's
// refractory end at the launching instant). Skips agent-modified intervals.
export function assertLaws(world, events, { untilMs = Infinity } = {}) {
  const nodes = new Map(world.nodes.map(node => [node.id, node]));
  const links = new Map(world.links.map(link => [link.id, link]));
  const lastUntil = new Map();
  const lastActivation = new Map();
  let checked = 0;
  for (const event of events) {
    if (event.tMs > untilMs) break;
    if (event.type === 'activation') {
      const law = nodes.get(event.nodeId).restitution;
      if (law && event.diastolicIntervalMs !== null) {
        const expected = Math.min(tick(law.erpMaxMs), Math.max(tick(law.erpMinMs),
          Math.round(tick(law.erpMaxMs) - tick(law.amplitudeMs) * Math.exp(-tick(event.diastolicIntervalMs) / tick(law.tauMs)))));
        assert.equal(tick(event.erpMs), expected, `restitution ${event.nodeId} at ${event.tMs}`);
        checked++;
      }
      lastActivation.set(event.nodeId, event);
    }
    if (event.type === 'conduction_launched') {
      const link = links.get(event.linkId);
      const direction = link.a === event.fromNodeId ? link.ab : link.ba;
      const parts = event.delayParts;
      if (parts.agentMs === 0 && parts.lesionMs === 0) {
        assert.equal(tick(parts.baseMs), tick(direction.delayMs), `base ${event.linkId}`);
        const source = lastActivation.get(event.fromNodeId);
        const sourceExtra = direction.decrement && source.diastolicIntervalMs !== null
          ? Math.round(tick(direction.decrement.maxExtraMs) * Math.exp(-tick(source.diastolicIntervalMs) / tick(direction.decrement.tauMs))) : 0;
        assert.equal(tick(parts.sourceMs), sourceExtra, `decrement ${event.linkId} at ${event.tMs}`);
        const until = lastActivation.get(event.toNodeId)?.refractoryUntilMs;
        const nominal = tick(event.departureMs) + tick(parts.baseMs) + sourceExtra;
        const entry = direction.entry && until !== undefined && nominal >= tick(until)
          ? Math.round(tick(direction.entry.maxExtraMs) * Math.exp(-(nominal - tick(until)) / tick(direction.entry.tauMs))) : 0;
        assert.equal(tick(parts.entryMs), entry, `entry ${event.linkId} at ${event.tMs}`);
        checked++;
      }
    }
    if (event.type === 'activation') lastUntil.set(event.nodeId, event.refractoryUntilMs);
  }
  return checked;
}
