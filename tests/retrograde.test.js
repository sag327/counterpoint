import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/index.js';
import { descendantsOf } from '../src/lab/measure.js';
import { traceMarks } from '../src/visuals/ladder.js';
import { sampleWeave } from '../src/visuals/weave.js';
import { createRestitutionConduction } from '../src/worlds/conduction.js';
import { createEchoWorld } from '../src/worlds/echo.js';
import { assertLaws } from './studies-common.js';

const stimulate = (nodeId, tMs, commandId = 'ventricular') => ({ commandId, type: 'stimulate', nodeId, tMs });
function run(world, commands = [], throughMs = 2000) {
  const engine = new Engine({ processingBudget: 1e6 });
  engine.reset(world, 'retrograde');
  for (const command of commands) engine.enqueue({ runId: 'retrograde', ...command });
  return { engine, events: engine.advanceTo(throughMs) };
}
function stimulusTrace(events, triggerId = 'ventricular') {
  const attempt = events.find(e => e.type === 'stimulus_attempted' && e.triggerId === triggerId);
  assert.ok(attempt);
  const ids = descendantsOf(events, [attempt.eventId]);
  return events.filter(e => ids.has(e.eventId));
}
const captures = events => events.filter(e => e.type === 'activation');
const launches = events => events.filter(e => e.type === 'conduction_launched');

for (const ventricle of ['V1', 'V2']) {
  test(`Conduction: a recovered ${ventricle} conducts through His and the node to the atrium, opposite branch and sinus`, () => {
    const world = createRestitutionConduction();
    const { events } = run(world, [stimulate('S', 0, 'drive'), stimulate(ventricle, 500)]);
    const trace = stimulusTrace(events);
    const atrialPath = [ventricle, 'H', 'N', 'A', 'S'];
    assert.deepEqual(captures(trace).filter(e => atrialPath.includes(e.nodeId)).map(e => e.nodeId), atrialPath);
    const opposite = ventricle === 'V1' ? 'V2' : 'V1';
    assert.equal(captures(trace).filter(e => e.nodeId === opposite).length, 1);
    assert.deepEqual(launches(trace).filter(e => ['NH', 'AN', 'SA'].includes(e.linkId))
      .map(e => [e.linkId, e.fromNodeId, e.toNodeId]), [['NH', 'H', 'N'], ['AN', 'N', 'A'], ['SA', 'A', 'S']]);
    assert.ok(launches(trace).find(e => e.linkId === 'NH').delayParts.sourceMs > 0, 'recovered His still applies shared decrement to the nodal link');
    assert.ok(assertLaws(world, events) >= 15, 'reverse launches and captures follow the same laws');
    const sinus = captures(events).filter(e => e.nodeId === 'S');
    assert.deepEqual(sinus.map(e => e.source), ['stimulus', 'conduction']);
  });
}

test('Echo: a recovered ventricle reaches the atrium through His, LCP and the faster recovered nodal limb', () => {
  const world = createEchoWorld();
  const { events } = run(world, [stimulate('S', 0, 'drive'), stimulate('V', 500)]);
  const trace = stimulusTrace(events);
  assert.deepEqual(captures(trace).filter(e => e.nodeId !== 'SP').map(e => e.nodeId), ['V', 'H', 'LCP', 'FP', 'CSp', 'HRA', 'S']);
  assert.deepEqual(launches(trace).filter(e => ['HV', 'LH'].includes(e.linkId)).map(e => [e.fromNodeId, e.toNodeId]), [['V', 'H'], ['H', 'LCP']]);
  assert.ok(events.some(e => e.type === 'conduction_collision' && e.linkId === 'SL'), 'the later slow-limb wave meets the wave from atrial breakthrough');
  assert.ok(assertLaws(world, events) >= 24);
  const sinus = captures(events).filter(e => e.nodeId === 'S');
  assert.deepEqual(sinus.map(e => e.source), ['stimulus', 'conduction']);
});

for (const [name, create, ventricle, earlyMs] of [
  ['Conduction', createRestitutionConduction, 'V1', 400], ['Echo', createEchoWorld, 'V', 420],
]) {
  test(`${name}: premature ventricular stimulation fails locally without a reverse launch`, () => {
    const { events } = run(create(), [stimulate('S', 0, 'drive'), stimulate(ventricle, earlyMs)], 750);
    const trace = stimulusTrace(events);
    assert.equal(captures(trace).length, 0);
    assert.equal(launches(trace).length, 0);
    const blocked = trace.find(e => e.type === 'activation_blocked');
    assert.equal(blocked.nodeId, ventricle);
    assert.equal(blocked.cause, 'refractory');
    assert.ok(blocked.remainingErpMs > 0);
  });
}

test('Ventricular capture can block in unrecovered His in both production models', () => {
  for (const [create, ventricle, preparation] of [
    [createRestitutionConduction, 'V1', [stimulate('H', 350, 'condition-his')]],
    [createEchoWorld, 'V', []],
  ]) {
    const { events } = run(create(), [stimulate('S', 0, 'drive'), ...preparation, stimulate(ventricle, 450)], 750);
    const trace = stimulusTrace(events);
    assert.deepEqual(captures(trace).map(e => e.nodeId), [ventricle]);
    const blocked = trace.find(e => e.type === 'activation_blocked');
    assert.equal(blocked.nodeId, 'H');
    assert.equal(blocked.cause, 'refractory');
    assert.ok(blocked.remainingErpMs > 0);
    assert.equal(launches(trace).length, 1, 'there is no launched upstream continuation after His block');
  }
});

test('First-node pacing never immediately reflects on the newly bidirectional links', () => {
  for (const create of [createRestitutionConduction, createEchoWorld]) {
    const drive = { commandId: 'drive', type: 'stimulateTrain', nodeId: 'S',
      tMs: 0, startMs: 0, cycleMs: 600, count: 10, label: 'S1' };
    const { events } = run(create(), [drive], 7999);
    for (const node of create().nodes) assert.equal(captures(events).filter(e => e.nodeId === node.id).length, 10, node.id);
    for (const activation of captures(events)) {
      assert.ok(launches(events).filter(e => e.activationId === activation.eventId)
        .every(e => !activation.incomingLinkIds.includes(e.linkId)), `no reflection from ${activation.nodeId}`);
    }
  }
});

test('Network passage clocks and Ladder marks follow actual reverse ventricular transits', () => {
  for (const [create, ventricle, tiers] of [
    [createRestitutionConduction, 'V1', ['S', 'A', 'N', 'H', 'V1', 'V2']],
    [createEchoWorld, 'V', ['S', 'HRA', 'CSp', 'FP', 'SP', 'LCP', 'H', 'V']],
  ]) {
    const world = create();
    const { engine, events } = run(world, [stimulate('S', 0, 'drive'), stimulate(ventricle, 500)]);
    const trace = stimulusTrace(events);
    const marks = traceMarks(events, tiers);
    const reverse = launches(trace).filter(e => world.links.find(l => l.id === e.linkId).b === e.fromNodeId);
    assert.ok(reverse.length >= 4);
    for (const launch of reverse) {
      const mark = marks.find(m => m.transitId === launch.transitId);
      assert.equal(mark.direction, 'retrograde');
      assert.equal(mark.from, launch.fromNodeId);
      assert.equal(mark.to, launch.toNodeId);
      assert.ok(mark.y1 < mark.y0);
      const mid = (launch.departureMs + launch.arrivalMs) / 2;
      assert.ok(engine.readAt(mid).activeTransits.some(t => t.transitId === launch.transitId));
      const link = world.links.find(l => l.id === launch.linkId);
      const passages = [{ launch }];
      assert.ok(sampleWeave(passages, link.a, .75, mid, 200).opening > 0, 'wave has passed the ventricular side');
      assert.equal(sampleWeave(passages, link.a, .25, mid, 200).opening, 0, 'wave has not reached the upstream side');
    }
  }
});
