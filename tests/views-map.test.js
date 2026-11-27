import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createEngine } from '../src/engine/index.js';
import { createCirculationWorld } from '../src/worlds/circulation.js';
import { RAMP_STOPS, createMap, deriveCycle, rampColor } from '../src/visuals/map.js';
import { ostinatoWorld, runOstinato } from './views-scenes.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas` : '@napi-rs/canvas');

const world = ostinatoWorld();
const events = runOstinato(3000);
const byId = new Map(events.map((e) => [e.eventId, e]));
const actsOf = (id) => events.filter((e) => e.type === 'activation' && e.nodeId === id);

test('M1 cycle latencies and seam on the ring match the engine', () => {
  const map = createMap({ world, referenceNodeId: 'R0' });
  assert.equal(map.update(events, 2900), true);
  const { state } = map;
  assert.equal(state.cycleMs, 261);
  // The reference's two latest activations bound the cycle.
  const r0 = actsOf('R0').filter((e) => e.tMs <= 2900);
  assert.equal(state.endMs, r0.at(-1).tMs);
  assert.equal(state.startMs, r0.at(-2).tMs);
  for (let i = 0; i < 10; i += 1) {
    const act = actsOf(`R${i}`).filter((e) => e.tMs <= state.endMs).at(-1);
    const expected = (((act.tMs - state.endMs) % 261) + 261) % 261;
    assert.equal(state.nodes.get(`R${i}`).latencyMs, expected, `R${i}`);
  }
  // The wave runs R0 -> R1 -> ... so R9 is the latest ring site and the seam is the link R9-R0.
  const ring = [...state.nodes].filter(([id]) => /^R\d$/.test(id));
  const latest = ring.reduce((a, b) => (b[1].latencyMs > a[1].latencyMs ? b : a));
  assert.equal(latest[0], 'R9');
  assert.equal(state.seam.linkId, 'L9');
  assert.deepEqual(new Set([state.seam.from, state.seam.to]), new Set(['R9', 'R0']));
  assert.ok(state.seam.t0 < 261 && state.seam.t1 >= 261, 'the seam link ends at the cycle boundary');
  // Only the seam wraps; the isthmus link is slow but monotone.
  assert.deepEqual(state.links.filter((l) => l.wraps).map((l) => l.linkId), ['L9']);
  const l4 = state.links.find((l) => l.linkId === 'L4');
  assert.equal(l4.t1 - l4.t0, 45);
});

test('M2 trace: every mark cites events; marks cover nodes and links', () => {
  const map = createMap({ world, referenceNodeId: 'R0' });
  map.update(events, 2900);
  const marks = map.traceMarks();
  for (const m of marks) for (const id of m.eventIds) assert.ok(byId.has(id), `${m.id} -> ${id}`);
  assert.ok(marks.some((m) => m.kind === 'seam' && m.linkId === 'L9'));
  assert.equal(marks.filter((m) => m.kind === 'mapNode').length, map.state.nodes.size);
  const seam = marks.find((m) => m.kind === 'seam');
  assert.ok(seam.fraction > 0 && seam.fraction <= 1);
  for (const m of marks.filter((x) => x.kind === 'mapNode')) {
    assert.equal(byId.get(m.eventIds[0]).nodeId, m.nodeId);
  }
});

test('M3 redraws once per cycle: state changes only when the reference activates', () => {
  const map = createMap({ world, referenceNodeId: 'R0' });
  let changes = 0;
  for (let t = 0; t <= 2900; t += 7) if (map.update(events, t)) changes += 1;
  const r0 = actsOf('R0');
  // First change arrives with the second reference activation; thereafter one per activation.
  const expected = r0.filter((e) => e.tMs <= 2900).length - 1;
  assert.equal(changes, expected);
  assert.equal(map.redraws, expected);
  // No future leak: before the second activation there is no overlay.
  assert.equal(deriveCycle(events, { world, referenceNodeId: 'R0', presentedMs: r0[1].tMs - 1 }), null);
});

test('M4 clockwise ring (production circulation) seam sits behind the reference', () => {
  const engine = createEngine({ processingBudget: 1e6 });
  const circ = createCirculationWorld();
  engine.reset(circ, 'k');
  engine.enqueue({ commandId: 'a', runId: 'k', type: 'stimulate', nodeId: 'R0', tMs: 0 });
  engine.enqueue({ commandId: 'b', runId: 'k', type: 'stimulate', nodeId: 'R0', tMs: 240 });
  const ev = engine.advanceTo(4000);
  const map = createMap({ world: circ, referenceNodeId: 'R3' });
  map.update(ev, 4000);
  assert.ok(map.state, 'cycle derived');
  {
    const seam = map.state.seam;
    assert.ok(seam, 'a circulating wave has a seam');
    const lat = (id) => map.state.nodes.get(id).latencyMs;
    const ends = [lat(seam.from), lat(seam.to)];
    assert.ok(Math.max(...ends) > map.state.cycleMs / 2 && Math.min(...ends) < map.state.cycleMs / 2);
  }
});

test('M5 ramp is gold-ivory-blue and drawing is deterministic', () => {
  assert.equal(rampColor(0), RAMP_STOPS[0]);
  assert.equal(rampColor(1), RAMP_STOPS[4]);
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [r0, , b0] = parse(rampColor(0.02)); const [r1, , b1] = parse(rampColor(0.98));
  assert.ok(r0 > b0 && b1 > r1, 'warm at the start, cool at the end');
  const pos = {};
  for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + i * Math.PI / 5; pos[`R${i}`] = { x: 150 + 100 * Math.cos(a), y: 150 + 100 * Math.sin(a) }; }
  ['N1', 'N2', 'N3', 'H', 'V'].forEach((id, i) => { pos[id] = { x: 270 + i * 30, y: 60 + i * 15 }; });
  const png = () => {
    const map = createMap({ world, referenceNodeId: 'R0' });
    map.update(events, 2900);
    const c = createCanvas(600, 600); const ctx = c.getContext('2d'); ctx.scale(2, 2);
    ctx.fillStyle = '#080C13'; ctx.fillRect(0, 0, 300, 300);
    map.draw(ctx, { nodePoint: (id) => pos[id], width: 300, height: 300, legend: true });
    return c.toBuffer('image/png');
  };
  assert.ok(png().equals(png()));
  const blank = createCanvas(600, 600); const bc = blank.getContext('2d'); bc.fillStyle = '#080C13'; bc.fillRect(0, 0, 600, 600);
  assert.ok(!png().equals(blank.toBuffer('image/png')));
});
