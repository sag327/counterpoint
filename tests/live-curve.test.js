// M2 · live S1–S2 curve built from performance events (creator decision 2026-11-27:
// curves such as the AH jump are built live while pacing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveCurve, extrastimulusPoints, liveCurveResult, liveCurveSummary } from '../src/lab/live-curve.js';
import { simulate } from '../src/lab/protocols.js';
import { echoPresentation, echoWorld } from '../src/worlds/echo.js';
import { descendantsOf, firstDescendant, round3 } from '../src/lab/measure.js';

const findEcho = echoPresentation.protocols.find(entry => entry.id === 'find-echo');
const guidedRun = (s2, index) => simulate(structuredClone(echoWorld), findEcho.commands(s2), 200 + 600 * 7 + s2 + 1500, { runId: `run-${index}` }).events;

test('guided first-node pacing plots septal coupling and AH when the beat reaches the septal atrium', () => {
  const values = [];
  for (let s2 = 400; s2 >= 230; s2 -= 10) values.push(s2);
  const curve = createLiveCurve();
  values.forEach((coupling, index) => {
    const events = guidedRun(coupling, index);
    curve.ingest(events, Infinity);
    const s2 = events.find(event => event.type === 'stimulus_attempted' && event.triggerId === 'S2');
    const a1 = events.findLast(event => event.type === 'activation' && event.nodeId === 'CSp' && event.tMs < s2.tMs);
    const descendants = descendantsOf(events, [s2.eventId]);
    const a2 = firstDescendant(events, descendants, 'CSp', ['activation']);
    const h2 = firstDescendant(events, descendants, 'H', ['activation']);
    const point = curve.points.at(-1);
    assert.equal(point.couplingMs, round3(a2.tMs - a1.tMs));
    assert.equal(point.ahMs, round3(h2.tMs - a2.tMs));
    assert.equal(point.driveCycleMs, 600);
  });
  assert.equal(curve.points.length, values.length, 'one point per guided run; drive pulses are not premature');
  assert.deepEqual(extrastimulusPoints(guidedRun(200, 99)), [], 'an upstream beat blocked before CSp supplies no local A2');
  const result = liveCurveResult(curve.points);
  assert.ok(result.summary.jump, 'the live curve shows the jump');
  assert.match(liveCurveSummary(result), /jump of \d+ ms at \d+(\.\d+)? ms/);
});

test('a point is final only after the presentation passes it by the settle window, and keys never repeat', () => {
  const events = guidedRun(300, 0);
  const s2 = events.find(event => event.type === 'stimulus_attempted' && event.triggerId === 'S2');
  assert.equal(extrastimulusPoints(events, { throughMs: s2.tMs + 1199 }).length, 0);
  const curve = createLiveCurve();
  assert.equal(curve.ingest(events, s2.tMs + 1200), true);
  assert.equal(curve.ingest(events, Infinity), false, 'ingesting again adds nothing');
  assert.equal(curve.points.length, 1);
  curve.clear();
  assert.equal(curve.points.length, 0);
});

test('a player touch during first-node pacing counts, measured from the previous atrial activation', () => {
  // A touch on CSp 420 ms after the third conducted pacing beat.
  const world = structuredClone(echoWorld);
  const drive = [{ commandId: 'S1', tMs: 0, startMs: 0, type: 'stimulateTrain', nodeId: 'S', cycleMs: 600, count: 3, label: 'S1' }];
  const probe = simulate(world, drive, 2500, { runId: 'probe' }).events;
  const csp = probe.filter(event => event.type === 'activation' && event.nodeId === 'CSp').map(event => event.tMs);
  assert.ok(csp.length >= 3);
  const touchAt = csp[2] + 420;
  const events = simulate(structuredClone(echoWorld), [...drive, { commandId: 'touch-1', tMs: touchAt, type: 'stimulate', nodeId: 'CSp' }], touchAt + 1500, { runId: 'touch' }).events;
  const [point] = extrastimulusPoints(events);
  assert.equal(point.couplingMs, 420);
  assert.equal(point.driveCycleMs, csp[2] - csp[1]);
  assert.equal(point.captured, true);
  assert.ok(point.ahMs > 0);
});

test('an empty curve has a plain summary', () => {
  assert.match(liveCurveSummary(liveCurveResult([])), /No premature beats yet/);
});
