import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Engine } from '../src/engine/index.js';
import {
  TICK_MS, activationTimes, classifyCadence, conductionDots, conductionPattern, decrementExtra, descendantsOf,
  detectJumps, effectiveRefractoryPeriod, entryExtra, entrainmentResult, firstDescendant, functionalRefractoryPeriod,
  intervals, lockingRatio, phaseDots, phaseShift, restitutionDots, restitutionErp, restitutionSlope, returnPairs,
  sameCyclicOrder, simpleFraction, siteIntervals, tachycardiaCycle, wenckebachCycle, activationOrder,
} from '../src/lab/measure.js';
import { chainWorld, entryRingWorld, hemiolaWorld, play, pulseAt, restitutionLaw, restitutionWorld, train } from './engine-v11-scenes.js';
import { echoPlateWorld, echoV11World } from './lab-worlds.js';

const act = (eventId, nodeId, tMs, causeIds = [], extra = {}) => ({ eventId, type: 'activation', nodeId, tMs, causeIds, ...extra });

test('ERP, FRP and jump rules on synthetic rows', () => {
  const points = [310, 305, 300, 299, 298, 240, 239, 230].map(c => ({ couplingMs: c, ok: c >= 300 || (c < 299 && c >= 240) }));
  assert.deepEqual(effectiveRefractoryPeriod(points), { erpMs: 299, resolutionMs: 1, upperMs: 300 });
  assert.equal(effectiveRefractoryPeriod([{ couplingMs: 300, ok: true }]), null);
  assert.deepEqual(functionalRefractoryPeriod([{ couplingMs: 300, outputMs: 330 }, { couplingMs: 290, outputMs: 325 }, { couplingMs: 280, outputMs: null }]),
    { frpMs: 325, atCouplingMs: 290 });
  // A 49 ms rise is not a jump; 50 ms within 10 ms is; 60 ms over 12 ms of coupling is not.
  const curve = [[320, 100], [310, 149], [300, 152], [290, 202], [278, 262]].map(([couplingMs, valueMs]) => ({ couplingMs, valueMs }));
  assert.deepEqual(detectJumps(curve), [{ fromCouplingMs: 300, couplingMs: 290, fromMs: 152, toMs: 202, jumpMs: 50 }]);
});

test('Conduction patterns: Wenckebach, fixed 2:1, 1:1 and the Wenckebach cycle', () => {
  const wb = [];
  for (let g = 0; g < 6; g++) wb.push({ conducted: true, intervalMs: 180 }, { conducted: true, intervalMs: 210 }, { conducted: true, intervalMs: 230 }, { conducted: false, intervalMs: null });
  assert.deepEqual(conductionPattern(wb).ratio, '4:3');
  assert.equal(conductionPattern(wb).kind, 'wenckebach');
  const fixed = Array.from({ length: 20 }, (_, i) => ({ conducted: i % 2 === 0, intervalMs: i % 2 === 0 ? 120 : null }));
  assert.equal(conductionPattern(fixed).ratio, '2:1');
  assert.equal(conductionPattern(fixed).kind, 'fixed');
  assert.equal(conductionPattern(Array(8).fill({ conducted: true, intervalMs: 100 })).ratio, '1:1');
  assert.deepEqual(wenckebachCycle([{ cycleMs: 400, pattern: '1:1' }, { cycleMs: 300, pattern: '4:3', kind: 'wenckebach' }, { cycleMs: 280, pattern: '3:2' }]),
    { cycleMs: 300, pattern: '4:3', kind: 'wenckebach' });
});

test('Entrainment: TCL, capture, PPI − TCL and cyclic order', () => {
  // Circulation at 300 ms, paced at 280 ms from 3000 for 6 pulses, returning 310 ms after the last.
  const times = [0, 300, 600, 900, 1200, 1500, 1800, 2100, 2400, 2700];
  for (let k = 0; k < 6; k++) times.push(2980 + 280 * k);
  const last = 2980 + 280 * 5;
  times.push(last + 310, last + 610);
  assert.equal(tachycardiaCycle(times, 2700), 300);
  const result = entrainmentResult({ times, pacingCycleMs: 280, lastStimulusMs: last, tclMs: 300, orderBefore: ['A', 'B', 'C'], orderDuring: ['C', 'A', 'B'] });
  assert.deepEqual(result, { tclMs: 300, pacingCycleMs: 280, captured: true, sameOrder: true, ppiMs: 310, ppiMinusTclMs: 10 });
  assert.equal(sameCyclicOrder(['A', 'B', 'C'], ['A', 'C', 'B']), false);
  assert.equal(entrainmentResult({ times, pacingCycleMs: 281, lastStimulusMs: last, tclMs: 300 }).captured, false);
  const events = [act('e1', 'B', 10), act('e2', 'A', 20), act('e3', 'C', 40), act('e4', 'B', 310)];
  assert.deepEqual(activationOrder(events, ['A', 'B', 'C'], 0, 300), ['B', 'A', 'C']);
});

test('Cadence after ventricular pacing: V-A-V against V-A-A-V', () => {
  const chambers = { HRA: 'A', CSp: 'A', V: 'V' };
  const vav = [act('e1', 'V', 1000), act('e2', 'CSp', 1100), act('e3', 'HRA', 1130), act('e4', 'V', 1400)];
  assert.equal(classifyCadence(vav, { chambers, lastPacedMs: 1000 }).cadence, 'VAV');
  const vaav = [act('e1', 'V', 1000), act('e2', 'CSp', 1100), act('e3', 'HRA', 1400), act('e4', 'V', 1600)];
  assert.equal(classifyCadence(vaav, { chambers, lastPacedMs: 1000 }).cadence, 'VAAV');
});

test('Fractions and return pairs', () => {
  assert.equal(simpleFraction(280 / 420).label, '2:3');
  assert.equal(simpleFraction(315 / 420).label, '3:4');
  assert.equal(simpleFraction(0.7, { tolerance: 1.5 / 420 }), null);
  assert.deepEqual(returnPairs([1, 2, 3]), [[1, 2], [2, 3]]);
});

test('Causal descent and site intervals on an engine run (Echo plate world, AH 110 at S2 300)', () => {
  const engine = new Engine({ processingBudget: 1e6 });
  engine.reset(echoPlateWorld(), 'm');
  for (let k = 0; k < 8; k++) engine.enqueue({ commandId: `S1#${k + 1}`, runId: 'm', type: 'stimulate', nodeId: 'CSp', tMs: 200 + 600 * k });
  engine.enqueue({ commandId: 'S2', runId: 'm', type: 'stimulate', nodeId: 'CSp', tMs: 4700 });
  const events = engine.advanceTo(6000);
  const root = events.find(e => e.type === 'stimulus_attempted' && e.triggerId === 'S2');
  const set = descendantsOf(events, [root.eventId]);
  assert.equal(firstDescendant(events, set, 'FP').type, 'activation');
  assert.equal(firstDescendant(events, set, 'H').tMs - 4700, 110);
  const ah = siteIntervals(events, 'CSp', 'H').find(row => row.fromMs === 4700);
  assert.equal(ah.intervalMs, 110);
  // At 299 the fast pathway blocks and the slow one conducts: AH 286.696 (closed form, G1 review).
  const late = new Engine({ processingBudget: 1e6 });
  late.reset(echoPlateWorld(), 'n');
  for (let k = 0; k < 8; k++) late.enqueue({ commandId: `S1#${k + 1}`, runId: 'n', type: 'stimulate', nodeId: 'CSp', tMs: 200 + 600 * k });
  late.enqueue({ commandId: 'S2', runId: 'n', type: 'stimulate', nodeId: 'CSp', tMs: 4699 });
  const ev2 = late.advanceTo(6000);
  const set2 = descendantsOf(ev2, [ev2.find(e => e.triggerId === 'S2').eventId]);
  assert.equal(firstDescendant(ev2, set2, 'FP').type, 'activation_blocked');
  assert.ok(Math.abs(firstDescendant(ev2, set2, 'H', ['activation']).tMs - 4699 - 286.696) <= TICK_MS);
});

test('Engine dots lie on the §A law within one tick, including alternans at 300 ms', () => {
  for (const cycle of [340, 300]) {
    const { events } = play(restitutionWorld(), 'r', [train('T', 0, 'A', 0, cycle, 64)], [cycle * 64 + 10]);
    const dots = restitutionDots(events, 'A');
    assert.equal(dots.length, 63);
    for (const dot of dots) assert.ok(Math.abs(dot.erpMs - restitutionErp(restitutionLaw, dot.diMs)) <= TICK_MS, `${cycle} ${dot.diMs}`);
    if (cycle === 300) {
      const tail = dots.slice(-4).map(dot => dot.erpMs);
      assert.ok(Math.abs(tail[0] - tail[1]) > 100 && Math.abs(tail[0] - tail[2]) <= TICK_MS, 'alternation');
    }
  }
  assert.ok(Math.abs(restitutionSlope(restitutionLaw, 300 - 233.727) - 1.105) < 0.01);
});

test('Engine dots lie on decrement and entry laws within one tick (Echo v1.1 and the §B ring)', () => {
  const world = echoV11World();
  const { events } = play(world, 'd', [train('T', 0, 'CSp', 200, 500, 20), pulseAt('X', 10300, 'CSp')], [12000]);
  let checked = 0;
  for (const linkSpec of world.links) {
    for (const dot of conductionDots(events, linkSpec.id)) {
      const dir = dot.fromNodeId === linkSpec.a ? 'ab' : 'ba';
      const law = linkSpec[dir];
      if (dot.recoveryMs !== null) assert.ok(Math.abs(dot.parts.sourceMs - decrementExtra(law.decrement, dot.recoveryMs)) <= TICK_MS);
      const entry = dot.slackMs === null ? 0 : entryExtra(law.entry, dot.slackMs);
      assert.ok(Math.abs(dot.parts.entryMs - entry) <= TICK_MS, `${linkSpec.id} ${dot.slackMs}`);
      assert.ok(Math.abs(dot.totalMs - (dot.parts.baseMs + dot.parts.sourceMs + dot.parts.entryMs)) <= TICK_MS);
      checked++;
    }
  }
  assert.ok(checked > 100);
  const ring = play(entryRingWorld(), 'g', [pulseAt('S', 0, 'R4')], [4000]).events;
  const ringDots = conductionDots(ring, 'L0');
  assert.ok(ringDots.some(dot => dot.parts.entryMs > 0));
  for (const dot of ringDots) assert.ok(Math.abs(dot.parts.entryMs - (dot.slackMs === null ? 0 : entryExtra({ maxExtraMs: 20, tauMs: 60 }, dot.slackMs))) <= TICK_MS);
});

test('Wenckebach 4:3 from the §E chain and locking ratios from §D coupling', () => {
  const { events } = play(chainWorld(), 'c', [train('T', 0, 'A', 0, 300, 24)], [7500]);
  const pulses = events.filter(e => e.type === 'stimulus_attempted');
  const beats = pulses.map(pulse => {
    const set = descendantsOf(events, [pulse.eventId]);
    const h = firstDescendant(events, set, 'H', ['activation']);
    return { conducted: h !== null, intervalMs: h === null ? null : h.tMs - pulse.tMs };
  });
  const pattern = conductionPattern(beats);
  assert.equal(pattern.ratio, '4:3');
  assert.equal(pattern.kind, 'wenckebach');
  for (const [a, label] of [[0.17, '2:3'], [0.215, '3:4'], [0, null]]) {
    const run = play(hemiolaWorld(a), 'h', [], [720 * 420]).events;
    const lock = lockingRatio(run, 'A', 'B', { fromMs: 0, toMs: 720 * 420 });
    assert.equal(lock.fraction, label, `a=${a}`);
    for (const dot of phaseDots(run, 'B')) assert.ok(Math.abs(dot.shiftMs - phaseShift(1030, a, dot.phase)) <= TICK_MS);
  }
  assert.deepEqual(intervals(activationTimes([act('a', 'X', 0), act('b', 'X', 10.5)], 'X')), [10.5]);
});
