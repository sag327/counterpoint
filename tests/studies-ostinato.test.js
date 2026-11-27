// IV. Ostinato oracle (design/study-2-spec.md, "IV. Ostinato"): steady cycle
// 255–270 ms, ventricle 2:1 at tone 0 and 1:1 under Slow, termination within 3 laps
// of a complete isthmus lesion, entrainment PPI − TCL ≤ 10 ms in the circuit and
// ≈ 100 ms from bystander X (one 50 ms link off R3).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOstinatoWorld, ostinatoPresentation, ostinatoWorld, OSTINATO_RING } from '../src/worlds/ostinato.js';
import { acts, assertLaws, blocked, diffs, play, times } from './studies-common.js';

const [start, entrain] = ostinatoPresentation.protocols;
const induce = start.commands();
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const settled = (events, from, nodeId = 'R0') => diffs(times(events, nodeId).filter(t => t >= from));

test('Ostinato steady cycle 255–270 ms, constant after settling; the ventricle plays every other lap (2:1)', () => {
  const events = play(createOstinatoWorld(), induce, 20_000);
  const cycles = settled(events, 5000);
  assert.ok(cycles.every(c => c >= 255 && c <= 270), `cycles ${cycles.slice(0, 4)}`);
  assert.ok(Math.max(...cycles) - Math.min(...cycles) < 0.5, 'settled to the restitution / entry fixed point');
  // Base lap 9 × 24 + 45 = 261 ms; the excess is §B entry slowing, which lies on its law:
  assert.ok(cycles[0] > 9 * OSTINATO_RING.delayMs + OSTINATO_RING.isthmus.delayMs);
  assertLaws(ostinatoWorld, events, { untilMs: 8000 });
  const v = settled(events, 5000, 'V');
  for (const interval of v) assert.ok(Math.abs(interval - 2 * cycles[0]) < 1, `V every two laps: ${interval}`);
  // Every dropped lap stops in the silent nodal chain.
  // Every dropped lap stops in the silent nodal chain (V's only blocks are the later of its two bundle inputs).
  for (const b of blocked(events).filter(b => b.tMs > 5000 && b.nodeId !== 'V')) assert.match(b.nodeId, /^(N[123]|R9)$/);
});

test('Ostinato Slow lengthens the lap to about 340–360 ms and the ventricle doubles its rate (1:1)', () => {
  const events = play(createOstinatoWorld(), [...induce, { commandId: 'slow', tMs: 3000, type: 'applyAgent', agent: 'slow', doseScale: 1 }], 20_000);
  const ring = settled(events, 10_000);
  const v = settled(events, 10_000, 'V');
  assert.ok(ring.every(c => c >= 330 && c <= 370), `slowed lap ${ring[0]}`);
  assert.ok(v.every((interval, i) => Math.abs(interval - ring[0]) < 0.5), `1:1: ${v.slice(0, 3)}`);
  const before = settled(events, 1000).slice(2, 6);
  assert.ok(v[0] < 2 * before[0], 'ventricle faster than before Slow');
});

test('Ostinato Stillness thins the ventricle to high-grade block (3:1 or slower) for about 6 s while the figure continues, then 2:1 returns', () => {
  // Spec correction: the model gives high-grade nodal block, not a silent ventricle. With nodal ERP + 600 ms
  // the chain recovers within four ring laps, so it still conducts about one lap in four (docs/runs/studies-01.md).
  const at = 4000;
  const events = play(createOstinatoWorld(), [...induce, { commandId: 'still', tMs: at, type: 'applyAgent', agent: 'stillness', doseScale: 1 }], 20_000);
  const lap = 268.1;
  const v = times(events, 'V');
  const slowBeats = diffs(v).map((d, i) => [v[i], d]).filter(([, d]) => d >= 3 * lap - 1);
  const span = slowBeats.at(-1)[0] + slowBeats.at(-1)[1] - slowBeats[0][0];
  assert.ok(span >= 4500 && span <= 9500, `high-grade block lasts ${span} ms`);
  assert.ok(Math.max(...diffs(v)) >= 6 * lap, 'the longest ventricular rest spans at least six laps');
  assert.ok(times(events, 'R0').filter(t => t > at && t < at + 9000).length > 30, 'the ostinato keeps circulating');
  assert.ok(diffs(v.filter(t => t > 15_000)).every(d => Math.abs(d - 2 * lap) < 1), '2:1 returns');
  assert.ok(blocked(events).filter(b => b.tMs > at && b.tMs < at + 9500 && /^N/.test(b.nodeId)).length > 10, 'block is nodal');
});

test('Ostinato isthmus lesion: the lap slows stepwise and the figure stops within 3 laps after p = 1; half a lesion leaves a slower figure', () => {
  const events = play(createOstinatoWorld(), [...induce, { commandId: 'line', tMs: 5000, type: 'ablate', target: 'L4', durationMs: 2000, completeness: 1 }], 12_000);
  const complete = events.find(e => e.type === 'link_changed' && e.linkId === 'L4').tMs;
  const r0 = times(events, 'R0').filter(t => t > 5000);
  const laps = diffs(r0);
  for (let i = 1; i < laps.length; i++) assert.ok(laps[i] > laps[i - 1] - 0.2, `slows over the lesion: ${laps}`);
  assert.ok(laps.at(-1) - laps[0] > 50, 'audibly slower before it stops');
  const lap = 268;
  const ringAfter = events.filter(e => e.type === 'activation' && /^R\d$/.test(e.nodeId) && e.tMs > complete);
  assert.ok(ringAfter.every(e => e.tMs <= complete + 3 * lap), 'stops within 3 laps');
  assert.equal(events.filter(e => e.type === 'activation' && e.tMs > complete + 3 * lap).length, 0, 'silence');

  const half = play(createOstinatoWorld(), [...induce, { commandId: 'line', tMs: 5000, type: 'ablate', target: 'L4', durationMs: 2000, completeness: 0.5 }], 15_000);
  const slower = settled(half, 10_000);
  // Lesioned isthmus 45 × (1 + 3 · 0.25) = 78.75 ms: the lap lengthens by about 33.75 ms.
  assert.ok(slower.every(c => c > 268 + 30 && c < 268 + 40), `incomplete lesion lap ${slower[0]}`);
});

function entrainment(nodeId, cycleMs) {
  const at = 6003;
  const count = 12;
  const events = play(createOstinatoWorld(), [...induce, ...entrain.commands(nodeId, at, cycleMs, count)], 14_000);
  const t = times(events, nodeId);
  const tcl = median(diffs(t.filter(x => x < at).slice(-6)));
  const paced = t.filter(x => x >= at && x <= at + (count - 1) * cycleMs);
  const captured = diffs(paced).slice(-3);
  const last = at + (count - 1) * cycleMs;
  const ppi = t.find(x => x > last) - last;
  return { events, tcl, ppi, captured };
}

test('Ostinato entrainment from R0 (in the circuit): capture, then PPI − TCL within 10 ms', () => {
  for (const cycle of [248, 240]) {
    const { tcl, ppi, captured, events } = entrainment('R0', cycle);
    assert.ok(captured.every(c => Math.abs(c - cycle) < 0.002), 'three captured cycles at the pacing cycle');
    assert.ok(Math.abs(ppi - tcl) <= 10, `PPI − TCL ${ppi - tcl} at ${cycle}`);
    assert.ok(settled(events, 11_000).every(c => Math.abs(c - tcl) < 0.5), 'the same figure resumes');
  }
});

test('Ostinato entrainment from bystander X: PPI − TCL ≈ 100 ms (2 × 50 ms link), within ±10 ms', () => {
  for (const cycle of [248, 240]) {
    const { tcl, ppi, captured } = entrainment('X', cycle);
    assert.ok(captured.every(c => Math.abs(c - cycle) < 0.002));
    assert.ok(Math.abs(ppi - tcl - 2 * OSTINATO_RING.bystander.delayMs) <= 10, `PPI − TCL ${ppi - tcl}`);
  }
});
