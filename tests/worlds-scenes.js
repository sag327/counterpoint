import { conductionWorld } from '../src/worlds/conduction.js';
import { dualityWorld } from '../src/worlds/duality.js';
import { play } from './engine-scenes.js';

export const worldCases = {
  'conduction-steady': { world: conductionWorld, throughMs: 2000, commands: [] },
  'conduction-premature': {
    world: conductionWorld,
    throughMs: 1100,
    commands: [{ commandId: 'atrial', tMs: 275, type: 'stimulate', nodeId: 'A' }],
  },
  'conduction-block': {
    world: conductionWorld,
    throughMs: 1100,
    commands: [{ commandId: 'atrial', tMs: 274, type: 'stimulate', nodeId: 'A' }],
  },
  'conduction-edits': {
    world: conductionWorld,
    throughMs: 550,
    commands: [
      { commandId: 'nodal-delay', tMs: 90, type: 'setDirectionDelay', linkId: 'NH', direction: 'ab', delayMs: 75 },
      { commandId: 'ventricular-erp', tMs: 160, type: 'setNodeERP', nodeId: 'V1', erpMs: 200 },
      { commandId: 'atrial', tMs: 275, type: 'stimulate', nodeId: 'A' },
    ],
  },
  'duality-steady': { world: dualityWorld, throughMs: 3400, commands: [] },
  'duality-stimulus': {
    world: dualityWorld,
    throughMs: 3400,
    commands: [{ commandId: 'focus-a', tMs: 250, type: 'stimulate', nodeId: 'A' }],
  },
  'duality-cycle': {
    world: dualityWorld,
    throughMs: 3400,
    commands: [{ commandId: 'cycle-a', tMs: 400, type: 'setAutomaticity', nodeId: 'A', cycleMs: 550 }],
  },
  'duality-auto-block': {
    world: dualityWorld,
    throughMs: 1120,
    commands: [{ commandId: 'cycle-b', tMs: 200, type: 'setAutomaticity', nodeId: 'B', cycleMs: 200 }],
  },
};

export function runWorldCase(runId) {
  const { world, throughMs, commands } = worldCases[runId];
  const inputs = commands.map(command => ({ runId, ...command }));
  return { world, runId, throughMs, commands: inputs, ...play(world, runId, inputs, [throughMs]) };
}
