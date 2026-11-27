// M2 · live S1–S2 curve built from performance events (creator decision 2026-11-27:
// curves such as the AH jump are built live while pacing).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveCurve, extrastimulusPoints, liveCurveResult, liveCurveSummary } from '../src/lab/live-curve.js';
import { runProtocolSync, simulate } from '../src/lab/protocols.js';
import { echoPresentation, echoWorld } from '../src/worlds/echo.js';
import { buildProtocol } from '../src/ui/lab-panel.js';

const findEcho = echoPresentation.protocols.find(entry => entry.id === 'find-echo');
const guidedRun = (s2, index) => simulate(structuredClone(echoWorld), findEcho.commands(s2), 200 + 600 * 7 + s2 + 1500, { runId: `run-${index}` }).events;

test('each guided Find the echo run yields one point that matches the headless S1–S2 runner', () => {
  const values = [];
  for (let s2 = 400; s2 >= 200; s2 -= 10) values.push(s2);
  const reference = runProtocolSync(structuredClone(echoWorld), buildProtocol('s1s2', { siteId: 'CSp', driveCycleMs: 600, driveCount: 8, fromMs: 400, toMs: 200, stepMs: 10 }));
  const curve = createLiveCurve();
  values.forEach((s2, index) => {
    const events = guidedRun(s2, index);
    curve.ingest(events, Infinity);
  });
  assert.equal(curve.points.length, values.length, 'one point per guided run; drive pulses are not premature');
  for (const point of curve.points) {
    const row = reference.rows.find(entry => entry.s2Ms === point.couplingMs);
    assert.ok(row, `runner has a row for ${point.couplingMs}`);
    assert.equal(point.captured, row.captured, `captured at ${point.couplingMs}`);
    assert.equal(point.ahMs, row.a2h2Ms, `A2–H2 at ${point.couplingMs}`);
    assert.equal(point.driveCycleMs, 600);
  }
  const result = liveCurveResult(curve.points);
  assert.ok(result.summary.jump, 'the live curve shows the jump');
  assert.equal(result.summary.jump.couplingMs, reference.summary.jumps?.[0]?.couplingMs ?? result.summary.jump.couplingMs);
  assert.match(liveCurveSummary(result), /jump of \d+ ms at \d+ ms/);
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

test('a player touch during sinus rhythm counts, measured from the previous atrial activation', () => {
  // Sinus at 800 ms; a touch on CSp 420 ms after the third CSp activation.
  const world = structuredClone(echoWorld);
  const probe = simulate(world, [], 2500, { runId: 'probe' }).events;
  const csp = probe.filter(event => event.type === 'activation' && event.nodeId === 'CSp').map(event => event.tMs);
  assert.ok(csp.length >= 3);
  const touchAt = csp[2] + 420;
  const events = simulate(structuredClone(echoWorld), [{ commandId: 'touch-1', tMs: touchAt, type: 'stimulate', nodeId: 'CSp' }], touchAt + 1500, { runId: 'touch' }).events;
  const [point] = extrastimulusPoints(events);
  assert.equal(point.couplingMs, 420);
  assert.equal(point.driveCycleMs, csp[2] - csp[1]);
  assert.equal(point.captured, true);
  assert.ok(point.ahMs > 0);
});

test('an empty curve has a plain summary', () => {
  assert.match(liveCurveSummary(liveCurveResult([])), /No premature beats yet/);
});
