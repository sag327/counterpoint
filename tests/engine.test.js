import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEngine, SimulationFault } from '../src/engine/index.js';
import { circulationWorld, createCirculationWorld } from '../src/worlds/circulation.js';
import { captureTimes, captures, direction, fixture, link, linkEdit, node, ofType, play, runRing, stimulus, sweepRing, world } from './engine-scenes.js';

test('E01–02 rested capture, ERP minus one block, and exact ERP capture', () => {
  const runId = 'isolated';
  const { engine, initial, events } = play(world([node('A', 100)]), runId,
    [0, 99, 100].map((tMs, i) => stimulus(runId, `S${i + 1}`, tMs, 'A')), [100]);
  assert.equal(initial.nodes.A.recovery, 1);
  assert.equal(initial.nodes.A.lastActivationMs, null);
  assert.equal(initial.nodes.A.refractoryUntilMs, null);
  assert.deepEqual(captures(events).map(e => [e.tMs, e.priorActivationMs, e.refractoryUntilMs, e.recoveryBefore]),
    [[0, null, 100, 1], [100, 0, 200, 0]]);
  assert.deepEqual(ofType(events, 'activation_blocked').map(e => [e.tMs, e.remainingErpMs, e.refractoryUntilMs]), [[99, 1, 100]]);
  assert.equal(engine.readAt(99).nodes.A.lastActivationMs, 0);
  assert.equal(engine.readAt(100).nodes.A.lastActivationMs, 100);
});

test('E03–04 directed delay, no reverse direction or immediate reflection, and fresh relaunch', () => {
  const runId = 'edge';
  const topology = [node('B'), node('A')];
  const commands = [stimulus(runId, 's1', 0, 'A'), stimulus(runId, 's2', 120, 'B')];
  const directed = play(world(topology, [link('L', 'A', 'B', direction(), direction(60, false))]), runId, commands, [250]);
  const bidirectional = play(world(topology, [link('L', 'A', 'B')]), runId, commands, [250]);
  assert.deepEqual(ofType(directed.events, 'conduction_launched').map(e => [e.departureMs, e.arrivalMs, e.fromNodeId]), [[0, 60, 'A']]);
  assert.deepEqual(ofType(bidirectional.events, 'conduction_launched').map(e => [e.departureMs, e.arrivalMs, e.fromNodeId]), [[0, 60, 'A'], [120, 180, 'B']]);
  assert.deepEqual(ofType(bidirectional.events, 'conduction_arrived').map(e => [e.tMs, e.nodeId]), [[60, 'B'], [180, 'A']]);
});

test('E05 batches external, automatic and multiple arrival causes and excludes every incoming link', () => {
  const runId = 'mixed';
  const auto = { cycleMs: 200, firstAttemptMs: 60, resetOnCapture: true };
  const scene = world([node('D'), node('C', 50, auto), node('B'), node('A')],
    [link('2', 'B', 'C'), link('3', 'C', 'D'), link('1', 'A', 'C')]);
  const commands = [stimulus(runId, 'b', 0, 'B'), stimulus(runId, 'a', 0, 'A'),
    stimulus(runId, 'x', 60, 'C'), stimulus(runId, 'y', 60, 'C')];
  const { events } = play(scene, runId, commands, [60]);
  const batch = events.filter(event => event.tMs === 60);
  assert.deepEqual(batch.map(event => event.type), [
    'stimulus_attempted', 'stimulus_attempted', 'stimulus_attempted', 'conduction_arrived', 'conduction_arrived', 'activation', 'conduction_launched',
  ]);
  assert.deepEqual(batch.slice(0, 5).map(event => event.triggerId ?? event.transitId), ['x', 'y', 'auto1', 't1', 't2']);
  assert.equal(batch[5].source, 'mixed');
  assert.deepEqual(batch[5].causeIds, batch.slice(0, 5).map(event => event.eventId));
  assert.deepEqual(batch[5].incomingLinkIds, ['1', '2']);
  assert.equal(batch[6].linkId, '3');
  assert.equal(batch[6].activationId, batch[5].eventId);
});

test('E06–07 interior equal and staggered unequal collisions invalidate both arrivals', () => {
  const runId = 'collide';
  const topology = [node('A'), node('B')];
  const cases = [
    { ab: 60, ba: 60, second: 0, tMs: 30, position: 0.5 },
    { ab: 100, ba: 50, second: 25, tMs: 50, position: 0.5 },
    { ab: 120, ba: 60, second: 20, tMs: 53.333, position: 4 / 9 },
  ];
  for (const { ab, ba, second, tMs, position } of cases) {
    const scene = world(topology, [link('L', 'A', 'B', direction(ab), direction(ba))]);
    const { engine, events } = play(scene, runId, [stimulus(runId, 'a', 0, 'A'), stimulus(runId, 'b', second, 'B')], [200]);
    const collisions = ofType(events, 'conduction_collision');
    assert.deepEqual(collisions.map(e => [e.tMs, e.position, e.transitIds]), [[tMs, position, ['t1', 't2']]]);
    assert.equal(ofType(events, 'conduction_arrived').length, 0);
    assert.equal(engine.readAt(tMs - 0.001).activeTransits.length, 2);
    assert.deepEqual(engine.readAt(tMs).activeTransits, []);
  }
});

test('E08 cuts run first, cancel only their own transits in ordinal order, and do not resurrect', () => {
  const runId = 'cut-collision';
  const scene = world([node('A'), node('B'), node('C')], [link('L', 'A', 'B'), link('M', 'A', 'C')]);
  const commands = [stimulus(runId, 'a', 0, 'A'), stimulus(runId, 'b', 0, 'B'),
    linkEdit(runId, 'cut', 30, 'L', false), linkEdit(runId, 'restore', 30, 'L', true), linkEdit(runId, 'noop', 30, 'L', true)];
  const { engine, events } = play(scene, runId, commands, [100]);
  const cutBatch = events.filter(event => event.tMs === 30);
  assert.deepEqual(cutBatch.map(event => event.type), ['link_changed', 'conduction_canceled', 'conduction_canceled', 'link_changed']);
  assert.deepEqual(ofType(events, 'conduction_canceled').map(e => [e.transitId, e.position]), [['t1', 0.5], ['t3', 0.5]]);
  assert.deepEqual(ofType(events, 'link_changed').map(e => [e.generation, e.value]), [[1, false], [2, true]]);
  assert.deepEqual(ofType(events, 'conduction_arrived').map(e => [e.tMs, e.nodeId]), [[60, 'C']]);
  assert.equal(engine.readAt(29.999).links.L.generation, 0);
  assert.equal(engine.readAt(30).links.L.generation, 2);
  assert.deepEqual(engine.readAt(30).activeTransits.map(e => e.linkId), ['M']);
});

test('E09 direction delays and ERP edits E10 are prospective with independent generations', () => {
  const runId = 'edits';
  const scene = world([node('A', 100), node('B')], [link('L', 'A', 'B', direction(), direction(60, false))]);
  const params = { runId, tMs: 30 };
  const commands = [
    stimulus(runId, 'a', 0, 'A'),
    { ...params, commandId: 'del', type: 'setDirectionDelay', linkId: 'L', direction: 'ab', delayMs: 120 },
    { ...params, commandId: 'erp', type: 'setNodeERP', nodeId: 'A', erpMs: 50 },
    stimulus(runId, 'b', 99, 'A'), stimulus(runId, 'c', 100, 'A'),
  ];
  const { engine, events } = play(scene, runId, commands, [250]);
  assert.deepEqual(ofType(events, 'parameter_changed').map(e => [e.commandId, e.generation, e.previous, e.value]),
    [['del', 1, 60, 120], ['erp', 1, 100, 50]]);
  assert.deepEqual(ofType(events, 'conduction_arrived').map(e => e.tMs), [60, 220]);
  assert.deepEqual(ofType(events, 'activation_blocked').map(e => e.remainingErpMs), [1]);
  assert.equal(engine.readAt(60).nodes.A.erpMs, 50);
  assert.equal(engine.readAt(60).nodes.A.refractoryUntilMs, 100);
  assert.equal(engine.readAt(100).nodes.A.refractoryUntilMs, 150);
  assert.equal(engine.readAt(100).links.L.ab.delayMs, 120);
  assert.equal(engine.readAt(100).links.L.generation, 0);
});

test('E11 decrement uses the source recovery interval before capture', () => {
  const runId = 'decrement';
  const scene = world([node('A'), node('B')],
    [link('L', 'A', 'B', direction(10, true, { maxExtraMs: 50, tauMs: 30 }), direction(60, false))]);
  const commands = [0, 50, 150].map((tMs, i) => stimulus(runId, `s${i}`, tMs, 'A'));
  const { events } = play(scene, runId, commands, [250]);
  assert.deepEqual(ofType(events, 'conduction_launched').map(e => [e.departureMs, e.arrivalMs]),
    [[0, 10], [50, 110], [150, 169.444]]);
});

test('E12–13 automaticity resets, cadence, disabled tokens, blocked beats and mixed due capture', () => {
  const runId = 'auto';
  const scene = world([
    node('A', 100, { cycleMs: 300, firstAttemptMs: 100, resetOnCapture: true }),
    node('B', 300, { cycleMs: 200, firstAttemptMs: 0, resetOnCapture: false }),
    node('C'),
  ]);
  const cycle = (commandId, tMs, nodeId, cycleMs) => ({ runId, commandId, tMs, nodeId, cycleMs, type: 'setAutomaticity' });
  const commands = [stimulus(runId, 's1', 50, 'A'), stimulus(runId, 's2', 350, 'A'),
    cycle('on', 50, 'C', 200), cycle('off', 650, 'A', null), cycle('shift', 400, 'C', 300), cycle('resume', 750, 'A', 200)];
  const { events } = play(scene, runId, commands, [1000]);
  const autoAttempts = ofType(events, 'stimulus_attempted').filter(event => event.source === 'automaticity');
  assert.deepEqual(autoAttempts.filter(e => e.nodeId === 'A').map(e => e.tMs), [350, 950]);
  assert.deepEqual(autoAttempts.filter(e => e.nodeId === 'B').map(e => e.tMs), [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(autoAttempts.filter(e => e.nodeId === 'C').map(e => e.tMs), [250, 700, 1000]);
  assert.deepEqual(ofType(events, 'activation_blocked').map(e => [e.nodeId, e.tMs]), [['B', 200], ['B', 600], ['B', 1000]]);
  assert.equal(captures(events).filter(e => e.nodeId === 'A' && e.tMs === 350).at(0).source, 'mixed');
});

test('E14–17 matches every event in frozen A–C fixtures using production ring topology', () => {
  assert.deepEqual(circulationWorld, fixture('ring'));
  for (const protocol of ['A', 'B', 'C']) {
    const expected = fixture(`${protocol}.presentation`);
    const commands = fixture(`${protocol}.commands`);
    const { engine, events } = play(circulationWorld, commands[0].runId, commands, [expected.throughMs]);
    assert.deepEqual(events, expected.events);
    if (protocol !== 'B') assert.equal(engine.diagnostics().pendingItems, 0);
  }
});

test('E15 and E21 ring completes over twenty exact laps under long, small and irregular advancement', () => {
  const runId = 'long-ring';
  const throughMs = 10320;
  const commands = [stimulus(runId, 'S1', 0), stimulus(runId, 'S2', 240)];
  const { events, engine } = play(circulationWorld, runId, commands, [throughMs]);
  const small = Array.from({ length: throughMs / 10 + 1 }, (_, i) => i * 10);
  const steps = [1, 127, 4, 0.001, 77.781, 346, 13, 2];
  const irregular = [0];
  while (irregular.at(-1) < throughMs) irregular.push(Math.min(throughMs, irregular.at(-1) + steps[irregular.length % steps.length]));
  assert.deepEqual(play(circulationWorld, runId, commands, small).events, events);
  assert.deepEqual(play(circulationWorld, runId, commands, irregular).events, events);
  assert.deepEqual(captureTimes(events, 'R0'), [0, ...Array.from({ length: 22 }, (_, index) => 240 + 480 * index)]);
  assert.deepEqual(captures(events).filter(e => e.tMs === 300).map(e => e.nodeId), ['R7']);
  assert.deepEqual(ofType(events, 'activation_blocked').map(e => [e.tMs, e.nodeId, e.remainingErpMs]), [[300, 'R1', 60]]);
  assert.equal(engine.readAt(throughMs).activeTransits.length, 1);
  assert.deepEqual(engine.readAt(240).activeTransits.map(e => e.transitId), ['t9', 't10']);
});

test('E16 one-millisecond sweep measures the induction boundary on both sides', () => {
  const sustained = sweepRing().filter(result => result.sustained).map(result => result.couplingMs);
  assert.deepEqual(sustained, Array.from({ length: 80 }, (_, i) => 220 + i));
});

test('E17 active L4 cut cancels the halfway wave and restoration remains quiet', () => {
  const runId = 'active-cut';
  const { events, engine } = runRing(runId, [0, 240], 2000,
    [linkEdit(runId, 'cut', 930, 'L4', false), linkEdit(runId, 'restore', 1500, 'L4', true)]);
  assert.deepEqual(ofType(events, 'conduction_canceled').map(e => [e.tMs, e.linkId, e.position]), [[930, 'L4', 0.5]]);
  assert.equal(captures(events).at(-1).tMs, 900);
  assert.equal(engine.readAt(930).activeTransits.length, 0);
  assert.equal(engine.readAt(2000).links.L4.enabled, true);
  assert.equal(engine.diagnostics().pendingItems, 0);
});

test('E18 equal ERP prevents asymmetric induction and prolonged ERP blocks a full unidirectional return', () => {
  const equal = createCirculationWorld();
  equal.nodes.forEach(node => { node.erpMs = 220; });
  const equallyRecovered = runRing('equal', [0, 240], 2000, [], equal);
  assert.equal(captures(equallyRecovered.events).length, 16);
  assert.equal(captures(equallyRecovered.events).at(-1).tMs, 480);
  assert.equal(equallyRecovered.engine.diagnostics().pendingItems, 0);
  const prolonged = createCirculationWorld();
  prolonged.nodes.forEach(node => { node.erpMs = 500; });
  prolonged.links.forEach(link => { link.ba.enabled = false; });
  const exhausted = runRing('prolonged', [0], 2000, [], prolonged);
  assert.equal(captures(exhausted.events).length, 8);
  assert.deepEqual(ofType(exhausted.events, 'activation_blocked').map(e => [e.nodeId, e.tMs, e.remainingErpMs]), [['R0', 480, 20]]);
  assert.equal(exhausted.engine.diagnostics().pendingItems, 0);
});

test('Protocol D manual perturbation collides and phase-resets sustained circulation', () => {
  const { events } = runRing('manual', [0, 240, 500], 2000);
  assert.deepEqual(ofType(events, 'conduction_collision').map(e => [e.linkId, e.tMs, e.position]), [['L1', 610, 5 / 6]]);
  assert.deepEqual(captureTimes(events, 'R0'), [0, 240, 500, 980, 1460, 1940]);
});

test('E22 reject invalid input before mutation and make faulted batches invisible to reads', () => {
  const engine = createEngine({ processingBudget: 7 });
  const runId = 'budget';
  const scene = world([node('A')]);
  engine.reset(scene, runId);
  assert.throws(() => engine.reset(world([node('A'), node('A')]), 'bad'), /Duplicate/);
  assert.throws(() => engine.reset(world([node('A')], [link('x', 'A', 'B')]), 'bad'), /distinct existing/);
  assert.throws(() => engine.reset(world([node('A'), node('B')], [link('x', 'A', 'B', direction(0.999))]), 'bad'), /duration range/);
  assert.throws(() => engine.readAt(0), /committed/);
  assert.throws(() => engine.enqueue(stimulus('stale', 'S', 0, 'A')), /different run/);
  assert.throws(() => engine.enqueue(stimulus(runId, 'S', 0, 'B')), /Unknown command target/);
  assert.throws(() => engine.enqueue(stimulus(runId, 'S', NaN, 'A')), /nonnegative/);
  assert.throws(() => engine.enqueue(stimulus(runId, 'S', 1e30, 'A')), /safe simulation timeline/);
  for (const erpMs of [49, 1001, 0, NaN, Infinity]) {
    assert.throws(() => engine.enqueue({ runId, commandId: 'S', tMs: 0, nodeId: 'A', erpMs, type: 'setNodeERP' }));
  }
  assert.throws(() => engine.advanceTo(Infinity), /nonnegative/);
  engine.enqueue(stimulus(runId, 'S', 0, 'A'));
  assert.throws(() => engine.enqueue(stimulus(runId, 'S', 100, 'A')), /Duplicate/);
  engine.enqueue(stimulus(runId, 'S2', 50, 'A'));
  engine.enqueue(stimulus(runId, 'S3', 50, 'A'));
  assert.throws(() => engine.advanceTo(50), fault => fault instanceof SimulationFault && fault.code === 'PROCESSING_BUDGET' &&
    fault.tMs === 50 && fault.committedThroughMs === 0 && fault.events.length === 2 && Object.isFrozen(fault.events));
  assert.equal(engine.readAt(0).nodes.A.lastActivationMs, 0);
  assert.throws(() => engine.readAt(50), /committed/);
  assert.throws(() => engine.advanceTo(60), /faulted/);
  assert.throws(() => engine.enqueue(stimulus(runId, 'S4', 60, 'A')), /faulted/);
  engine.reset(scene, 'fresh');
  engine.enqueue(stimulus('fresh', 'S', 0, 'A'));
  const fresh = engine.advanceTo(100);
  assert.deepEqual(fresh.map(e => [e.runId, e.eventId]), [['fresh', 'e1'], ['fresh', 'e2']]);
  assert.throws(() => engine.enqueue(stimulus('fresh', 'S5', 100.0004, 'A')), /committed/);
  assert.throws(() => engine.advanceTo(99), /backward/);
  assert.deepEqual(engine.advanceTo(100.0004), []);
});

test('E23 multiple waves recompute the earliest valid collision without reusing either wave', () => {
  const runId = 'multiple';
  const scene = world([node('A'), node('B')], [link('L', 'A', 'B', direction(300), direction(120))]);
  const commands = [stimulus(runId, 'a1', 0, 'A'), stimulus(runId, 'a2', 100, 'A'),
    stimulus(runId, 'b1', 120, 'B'), stimulus(runId, 'b2', 180, 'B')];
  const { events, engine } = play(scene, runId, commands, [500]);
  assert.deepEqual(ofType(events, 'conduction_collision').map(e => [e.tMs, e.transitIds]),
    [[171.429, ['t1', 't3']], [242.857, ['t2', 't4']]]);
  assert.deepEqual(ofType(events, 'conduction_arrived'), []);
  assert.equal(engine.diagnostics().pendingItems, 0);
});

test('normalized half-ticks, terminal visibility, rounded and exact endpoint meetings', () => {
  const runId = 'ticks';
  const nearTick = play(world([node('A')]), runId, [stimulus(runId, 'tie', 0.5005, 'A')], [0.501]);
  assert.deepEqual(captureTimes(nearTick.events, 'A'), [0.501]);
  assert.equal(nearTick.engine.readAt(0.50049).nodes.A.lastActivationMs, null);
  const scene = (ab, ba) => world([node('A'), node('B')], [link('L', 'A', 'B', direction(ab), direction(ba))]);
  const start = stimulus(runId, 'first', 0, 'A');
  const preexisting = play(scene(1, 500), runId, [start, stimulus(runId, 'opposite', 0.999, 'B')], [501]);
  const preexistingCollision = ofType(preexisting.events, 'conduction_collision')[0];
  assert.equal(preexistingCollision.tMs, 1);
  assert(preexistingCollision.position < 1 && preexistingCollision.position > 0.999);
  assert.deepEqual(ofType(preexisting.events, 'conduction_arrived'), []);
  const causedSameTick = play(scene(500, 1), runId, [start, stimulus(runId, 'opposite', 499.999, 'B')], [501]);
  const sameTick = causedSameTick.events.filter(e => e.tMs === 499.999);
  assert.deepEqual(sameTick.map(e => e.type), ['stimulus_attempted', 'activation', 'conduction_launched', 'conduction_collision']);
  assert.deepEqual(causedSameTick.engine.readAt(499.999).activeTransits, []);
  const exact = play(scene(1, 500), runId, [start, stimulus(runId, 'at-endpoint', 1, 'B')], [501]);
  assert.deepEqual(exact.events.filter(e => e.tMs === 1).map(e => e.type), ['stimulus_attempted', 'conduction_arrived', 'activation']);
  assert.equal(captures(exact.events).at(-1).source, 'mixed');
});

test('historical reads are immutable, have complete batches, and fail before retained floor', () => {
  const runId = 'history';
  const scene = world([node('__proto__'), node('B')], [link('L', '__proto__', 'B')]);
  const { engine } = play(scene, runId, [stimulus(runId, 'start', 0, '__proto__')], [200], { historyBatches: 1 });
  assert.equal(engine.diagnostics().retainedFromMs, 0);
  assert.equal(engine.diagnostics().retainedBatches, 1);
  assert.equal(engine.readAt(59.999).activeTransits.length, 1);
  const atArrival = engine.readAt(60);
  assert.equal(atArrival.nodes.__proto__.lastActivationMs, 0);
  assert.equal(atArrival.nodes.B.refractoryUntilMs, 110);
  assert.equal(atArrival.nodes.__proto__.recovery, 1 / 12);
  assert.deepEqual(atArrival.activeTransits, []);
  assert.throws(() => { atArrival.links.L.ab.enabled = false; }, TypeError);
  assert.throws(() => { atArrival.nodes.B.recovery = 123; }, TypeError);
  engine.enqueue(stimulus(runId, 'next', 201, '__proto__'));
  engine.advanceTo(400);
  assert.equal(engine.diagnostics().retainedFromMs, 201);
  assert.throws(() => engine.readAt(60), /outside retained/);
  assert.equal(engine.readAt(201).activeTransits.length, 1);
  assert.equal(engine.readAt(400).activeTransits.length, 0);
});
