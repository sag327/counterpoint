import { captureTimes, direction, fixture, link, linkEdit, node, play, stimulus, sweepRing, world } from './engine-scenes.js';
import { circulationWorld, createCirculationWorld } from '../src/worlds/circulation.js';

function trace(world, runId, commands, throughMs) {
  const { engine, events } = play(world, runId, commands, [throughMs]);
  return { world, commands, throughMs, diagnostics: engine.diagnostics(), events };
}

const ringCases = {};
for (const protocol of ['A', 'B', 'C']) {
  const commands = fixture(`${protocol}.commands`);
  ringCases[protocol] = trace(circulationWorld, commands[0].runId, commands, fixture(`${protocol}.presentation`).throughMs);
}

const isolated = trace(world([node('A', 100)]), 'isolated',
  [0, 99, 100].map((tMs, i) => stimulus('isolated', `S${i + 1}`, tMs, 'A')), 100);
const directed = trace(world([node('A'), node('B')], [link('L', 'A', 'B', direction(), direction(60, false))]), 'directed',
  [stimulus('directed', 'S1', 0, 'A'), stimulus('directed', 'S2', 120, 'B')], 250);

const collisionWorld = world([node('A'), node('B')], [link('L', 'A', 'B', direction(120), direction(60))]);
const collisionTraces = {};
for (const runId of ['stagger', 'stagger-cut']) {
  const commands = [stimulus(runId, 'S1', 0, 'A'), stimulus(runId, 'S2', 20, 'B')];
  if (runId === 'stagger-cut') commands.push(linkEdit(runId, 'cut', 40, 'L', false), linkEdit(runId, 'restore', 200, 'L', true));
  collisionTraces[runId] = trace(collisionWorld, runId, commands, 250);
}
const causalWorld = world([node('A'), node('B')], [link('L', 'A', 'B', direction(500), direction(1))]);
const causalRoundoff = trace(causalWorld, 'causal-roundoff',
  [stimulus('causal-roundoff', 'S1', 0, 'A'), stimulus('causal-roundoff', 'S2', 499.999, 'B')], 501);

const long = trace(circulationWorld, 'long-ring', [stimulus('long-ring', 'S1', 0), stimulus('long-ring', 'S2', 240)], 10320);
const returnsMs = captureTimes(long.events, 'R0').slice(1);
long.r0IntervalsAfterS2Ms = returnsMs.slice(1).map((tMs, i) => tMs - returnsMs[i]);
const activeCut = trace(circulationWorld, 'active-cut', [stimulus('active-cut', 'S1', 0), stimulus('active-cut', 'S2', 240),
  linkEdit('active-cut', 'cut', 930, 'L4', false), linkEdit('active-cut', 'restore', 1500, 'L4', true)], 2000);
const perturb = trace(circulationWorld, 'manual', [0, 240, 500].map((tMs, i) => stimulus('manual', `S${i + 1}`, tMs)), 2000);
const equal = createCirculationWorld();
equal.nodes.forEach(node => { node.erpMs = 220; });
const prolonged = createCirculationWorld();
prolonged.nodes.forEach(node => { node.erpMs = 500; });
prolonged.links.forEach(link => { link.ba.enabled = false; });
const equalControl = trace(equal, 'equal', [stimulus('equal', 'S1', 0), stimulus('equal', 'S2', 240)], 2000);
const prolongedControl = trace(prolonged, 'prolonged', [stimulus('prolonged', 'S1', 0)], 2000);

const evidence = {
  contract: '1.0.0',
  origin: 'actual-headless-engine',
  traces: { isolated, directed, ...collisionTraces, causalRoundoff, ...ringCases, long, activeCut, perturb, equalControl, prolongedControl },
  couplingSweep: sweepRing(),
};
console.log(JSON.stringify(evidence, null, 2));
