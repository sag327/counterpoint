import { readFileSync } from 'node:fs';
import { createEngine } from '../src/engine/index.js';
import { circulationWorld } from '../src/worlds/circulation.js';

export const captures = events => events.filter(event => event.type === 'activation');
export const ofType = (events, type) => events.filter(event => event.type === type);
export const captureTimes = (events, nodeId) => captures(events).filter(event => event.nodeId === nodeId).map(event => event.tMs);

export const stimulus = (runId, commandId, tMs, nodeId = 'R0') => ({ runId, commandId, tMs, type: 'stimulate', nodeId });
export const linkEdit = (runId, commandId, tMs, linkId, enabled) => ({ runId, commandId, tMs, type: 'setLinkEnabled', linkId, enabled });
export const node = (id, erpMs = 50, automaticity = null) => ({ id, erpMs, recoveryTailMs: 120, automaticity });
export const direction = (delayMs = 60, enabled = true, decrement = null) => ({ delayMs, enabled, decrement });
export const link = (id, a, b, ab = direction(), ba = direction()) => ({ id, a, b, enabled: true, ab, ba });
export const world = (nodes, links = []) => ({ worldId: 'miniature', nodes, links });

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/v1/${name}.json`, import.meta.url), 'utf8'));
}

export function play(world, runId, commands, horizons, options) {
  const engine = createEngine(options);
  const initial = engine.reset(world, runId);
  commands.forEach(command => engine.enqueue(command));
  const events = horizons.flatMap(horizon => engine.advanceTo(horizon));
  return { engine, initial, events };
}

export function runRing(runId, times, throughMs, rest = [], world = circulationWorld) {
  const commands = [...times.map((tMs, i) => stimulus(runId, `S${i + 1}`, tMs)), ...rest];
  return { commands, ...play(world, runId, commands, [throughMs]) };
}

export function sweepRing() {
  return Array.from({ length: 361 }, (_, couplingMs) => {
    const throughMs = couplingMs + 480 * 10;
    const { events, engine } = runRing(`coupling-${couplingMs}`, [0, couplingMs], throughMs);
    const returns = captureTimes(events, 'R0').filter(tMs => tMs > couplingMs);
    const sustained = returns.length === 10 && returns.every((tMs, i) => tMs === couplingMs + (i + 1) * 480) &&
      engine.readAt(throughMs).activeTransits.length === 1;
    return { couplingMs, sustained, returnCount: returns.length, lastCaptureMs: captures(events).at(-1)?.tMs ?? null };
  });
}
