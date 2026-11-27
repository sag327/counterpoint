import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/index.js';
import { CIRCULATION_S2_MS, createRestitutionRing } from '../src/worlds/circulation.js';
import { musicTableFor, mapActivation } from '../src/music/index.js';

function run(s2) {
  const world = createRestitutionRing();
  const engine = new Engine();
  engine.reset(world, 'ring');
  const times = s2 === undefined ? [0] : [0, s2];
  times.forEach((tMs, i) => engine.enqueue({
    runId: 'ring', commandId: `s${i}`, type: 'stimulate', nodeId: 'R0', tMs,
  }));
  return engine.advanceTo(6200);
}

test('Circulation adapts ERP and conduction delay to recovery and sustains guided reentry', () => {
  const world = createRestitutionRing();
  const events = run(CIRCULATION_S2_MS);
  const returns = events.filter(e => e.type === 'activation' && e.nodeId === 'R0');
  const [s1, s2, firstReturn, secondReturn] = returns;
  const firstLaunch = events.find(e => e.type === 'conduction_launched' && e.linkId === 'L7');
  const premature = events.find(e => e.type === 'conduction_launched' && e.linkId === 'L7' && e.tMs === s2.tMs);

  assert.equal(s1.erpMs, 180);
  assert.equal(s2.diastolicIntervalMs, CIRCULATION_S2_MS - s1.erpMs);
  assert.ok(s2.erpMs < s1.erpMs);
  assert.equal(s2.refractoryUntilMs, s2.tMs + s2.erpMs);
  assert.equal(firstLaunch.arrivalMs - firstLaunch.departureMs, 60);
  assert.ok(premature.delayParts.sourceMs > 0 && premature.delayParts.entryMs > 0);
  assert.ok(premature.arrivalMs - premature.departureMs > 60);
  assert.deepEqual(events.filter(e => e.type === 'activation_blocked').map(e => [e.nodeId, e.cause]), [['R1', 'refractory']]);
  assert.ok(firstReturn.tMs - s2.tMs > secondReturn.tMs - firstReturn.tMs);
  assert.ok(returns.length >= 12);
  assert.equal(musicTableFor(world), null);
  assert.ok(mapActivation(s1));
});

test('Circulation extinguishes after a single impulse and outside the reentry window', () => {
  assert.equal(run().filter(e => e.type === 'activation').length, 8);
  const early = run(170);
  assert.ok(early.some(e => e.type === 'activation_blocked' && e.nodeId === 'R0'));
  const late = run(320);
  assert.equal(late.filter(e => e.type === 'activation' && e.nodeId === 'R0').length, 2);
  assert.ok(late.some(e => e.type === 'conduction_collision'));
});
