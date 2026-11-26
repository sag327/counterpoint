import assert from 'node:assert/strict';
import { test } from 'node:test';
import { conductionWorld, createConductionWorld } from '../src/worlds/conduction.js';
import { createDualityWorld, dualityWorld } from '../src/worlds/duality.js';
import { captures, captureTimes, ofType } from './engine-scenes.js';
import { runWorldCase } from './worlds-scenes.js';

const orderedCaptures = events => captures(events).map(({ tMs, nodeId }) => [tMs, nodeId]);
const nodalLaunches = events => ofType(events, 'conduction_launched').filter(event => event.linkId === 'NH');
const bNodeIds = ['B', 'B1', 'B2'];

test('Reference worlds have directed topology and independent editable copies', () => {
  assert.deepEqual(conductionWorld.nodes.map(({ id, erpMs, recoveryTailMs }) => [id, erpMs, recoveryTailMs]), [
    ['S', 200, 120], ['A', 220, 120], ['N', 250, 120], ['H', 180, 120], ['V1', 260, 120], ['V2', 260, 120],
  ]);
  assert.deepEqual(dualityWorld.nodes.map(({ id, erpMs, recoveryTailMs }) => [id, erpMs, recoveryTailMs]), [
    ['A', 180, 150], ['A1', 200, 150], ['A2', 220, 150], ['B', 240, 150], ['B1', 240, 150], ['B2', 240, 150],
  ]);
  const connections = world => world.links.map(({ a, b }) => [a, b]);
  assert.deepEqual(connections(conductionWorld), [['S', 'A'], ['A', 'N'], ['N', 'H'], ['H', 'V1'], ['H', 'V2']]);
  assert.deepEqual(connections(dualityWorld), [['A', 'A1'], ['A', 'A2'], ['B', 'B1'], ['B', 'B2']]);
  for (const [preset, create] of [[conductionWorld, createConductionWorld], [dualityWorld, createDualityWorld]]) {
    const edited = create();
    assert.deepEqual(edited, preset);
    assert.ok(preset.links.every(link => link.enabled && link.ab.enabled && !link.ba.enabled));
    assert.ok(Object.isFrozen(preset.nodes[0].automaticity));
    edited.nodes[0].automaticity.cycleMs = 999;
    edited.links[0].ab.delayMs = 70;
    assert.notDeepEqual(edited, preset);
    assert.deepEqual(create(), preset);
  }
  assert.ok(Object.isFrozen(conductionWorld.links.find(link => link.id === 'NH').ab.decrement));
});

test('E19 Conduction starts rested and maintains the ordered automatic phrase', () => {
  const { events } = runWorldCase('conduction-steady');
  assert.deepEqual(orderedCaptures(events), [
    [0, 'S'], [25, 'A'], [60, 'N'], [125, 'H'], [150, 'V1'], [170, 'V2'],
    [800, 'S'], [825, 'A'], [860, 'N'], [925.920, 'H'], [950.920, 'V1'], [970.920, 'V2'],
    [1600, 'S'], [1625, 'A'], [1660, 'N'], [1725.920, 'H'], [1750.920, 'V1'], [1770.920, 'V2'],
  ]);
  assert.deepEqual(ofType(events, 'activation_blocked'), []);
  assert.deepEqual(ofType(events, 'stimulus_attempted').map(({ tMs, nodeId, source }) => [tMs, nodeId, source]), [
    [0, 'S', 'automaticity'], [800, 'S', 'automaticity'], [1600, 'S', 'automaticity'],
  ]);
});

test('E19 Conduction premature atrial capture slows NH at exact ERP and reaches both ventricles', () => {
  const { events } = runWorldCase('conduction-premature');
  const prematureN = captures(events).find(event => event.nodeId === 'N' && event.tMs === 310);
  assert.equal(prematureN.intervalMs, 250);
  assert.equal(prematureN.recoveryBefore, 0);
  assert.deepEqual(nodalLaunches(events).map(({ departureMs, arrivalMs }) => [departureMs, arrivalMs]), [
    [60, 125], [310, 465], [860, 932.388],
  ]);
  assert.deepEqual(orderedCaptures(events).filter(([tMs]) => tMs >= 275 && tMs < 800), [
    [275, 'A'], [310, 'N'], [465, 'H'], [490, 'V1'], [510, 'V2'],
  ]);
  assert.deepEqual(ofType(events, 'activation_blocked'), []);
  assert.deepEqual(captureTimes(events, 'S'), [0, 800]);
});

test('E19 Conduction one millisecond earlier blocks at N and leaves the next intrinsic beat intact', () => {
  const { events } = runWorldCase('conduction-block');
  const { events: steady } = runWorldCase('conduction-steady');
  assert.deepEqual(ofType(events, 'activation_blocked').map(({ tMs, nodeId, remainingErpMs, cause }) =>
    [tMs, nodeId, remainingErpMs, cause]), [[309, 'N', 1, 'refractory']]);
  assert.deepEqual(orderedCaptures(events).filter(([tMs]) => tMs >= 274 && tMs < 800), [[274, 'A']]);
  assert.deepEqual(orderedCaptures(events).filter(([tMs]) => tMs >= 800),
    orderedCaptures(steady).filter(([tMs]) => tMs >= 800 && tMs <= 1100));
});

test('E09–11 Conduction parameter edits preserve launched timings and current ERP', () => {
  const { engine, events } = runWorldCase('conduction-edits');
  assert.deepEqual(nodalLaunches(events).map(({ departureMs, arrivalMs }) => [departureMs, arrivalMs]), [
    [60, 125], [310, 475],
  ]);
  assert.equal(engine.readAt(90).links.NH.ab.delayMs, 75);
  assert.equal(engine.readAt(160).nodes.V1.erpMs, 200);
  assert.equal(engine.readAt(160).nodes.V1.refractoryUntilMs, 410);
  assert.equal(engine.readAt(500).nodes.V1.refractoryUntilMs, 700);
});

test('E20 Duality starts with the specified offset and keeps each downstream voice on its own cycle', () => {
  const { events } = runWorldCase('duality-steady');
  const aTimes = [0, 720, 1440, 2160, 2880];
  const bTimes = [170, 1200, 2230, 3260];
  for (const [focusTimes, voice, delayMs] of [
    [aTimes, 'A', 0], [aTimes, 'A1', 45], [aTimes, 'A2', 85],
    [bTimes, 'B', 0], [bTimes, 'B1', 60], [bTimes, 'B2', 110],
  ]) assert.deepEqual(captureTimes(events, voice), focusTimes.map(tMs => tMs + delayMs));
  assert.deepEqual(ofType(events, 'activation_blocked'), []);
});

test('E12, E20 Duality capture and cycle edits rephase only focus A', () => {
  const baseline = runWorldCase('duality-steady');
  const stimulated = runWorldCase('duality-stimulus');
  const edited = runWorldCase('duality-cycle');
  assert.deepEqual(captureTimes(stimulated.events, 'A'), [0, 250, 970, 1690, 2410, 3130]);
  assert.deepEqual(captureTimes(edited.events, 'A'), [0, 950, 1500, 2050, 2600, 3150]);
  const aAutomaticAttempts = events => ofType(events, 'stimulus_attempted')
    .filter(event => event.nodeId === 'A' && event.source === 'automaticity').map(event => event.tMs);
  assert.deepEqual(aAutomaticAttempts(stimulated.events), [0, 970, 1690, 2410, 3130]);
  assert.deepEqual(aAutomaticAttempts(edited.events), [0, 950, 1500, 2050, 2600, 3150]);

  // Event, trigger, and transit IDs are run-wide and change when A contributes more events.
  const bEvents = events => events.filter(event => bNodeIds.includes(event.nodeId ?? event.fromNodeId))
    .map(({ runId, eventId, seq, causeIds, activationId, transitId, triggerId, ...local }) => local);
  for (const alternative of [stimulated, edited]) {
    assert.deepEqual(bEvents(alternative.events), bEvents(baseline.events));
    const instants = new Set([...baseline.events, ...alternative.events].map(({ tMs }) => tMs));
    for (const tMs of instants) {
      const expected = baseline.engine.readAt(tMs);
      const actual = alternative.engine.readAt(tMs);
      for (const nodeId of bNodeIds) assert.deepEqual(actual.nodes[nodeId], expected.nodes[nodeId]);
    }
  }
});

test('E13 Duality keeps scheduling B automatic attempts after refractory blocks', () => {
  const { events } = runWorldCase('duality-auto-block');
  assert.deepEqual(ofType(events, 'stimulus_attempted').filter(event => event.nodeId === 'B')
    .map(({ tMs, source }) => [tMs, source]), [
    [170, 'automaticity'], [400, 'automaticity'], [600, 'automaticity'], [800, 'automaticity'], [1000, 'automaticity'],
  ]);
  assert.deepEqual(ofType(events, 'activation_blocked').map(({ tMs, nodeId, remainingErpMs }) =>
    [tMs, nodeId, remainingErpMs]), [[400, 'B', 10], [800, 'B', 40]]);
  assert.deepEqual(captureTimes(events, 'B'), [170, 600, 1000]);
  assert.deepEqual(captureTimes(events, 'B1'), [230, 660, 1060]);
  assert.deepEqual(captureTimes(events, 'B2'), [280, 710, 1110]);
  assert.deepEqual(captureTimes(events, 'A'), [0, 720]);
});
