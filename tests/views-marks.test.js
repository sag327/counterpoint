import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createEngine } from '../src/engine/index.js';
import { createRenderer } from '../src/visuals/renderer.js';
import {
  PHASE_ARC_MS, createNetworkMarks, doublePotentialGapPx, traceNetworkMarks,
} from '../src/visuals/marks.js';
import {
  chainWorld, runChain, runEntrainment, runFusion, runHemiola, runLesionRing,
} from './views-scenes.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas` : '@napi-rs/canvas');

const SIZE = 300;
// Straight-line geometry on a circle, enough to exercise the mark drawing without the full renderer.
function geometryFor(world) {
  const pos = new Map(world.nodes.map((n, i) => {
    const a = (i / world.nodes.length) * Math.PI * 2;
    return [n.id, { x: SIZE / 2 + 100 * Math.cos(a), y: SIZE / 2 + 100 * Math.sin(a) }];
  }));
  const link = (id) => world.links.find((l) => l.id === id);
  const linkPoint = (id, u) => { const l = link(id); const a = pos.get(l.a); const b = pos.get(l.b); return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }; };
  return { pos, nodePoint: (id) => pos.get(id), linkColor: () => '#C8A878', linkPoint,
    strokeLink(ctx, id, u0, u1, color, width, alpha = 1) {
      const p = linkPoint(id, u0); const q = linkPoint(id, u1);
      ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.globalAlpha = 1;
    } };
}
function paint(world, events, tMs, { transits = [] } = {}) {
  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#080C13'; ctx.fillRect(0, 0, SIZE, SIZE);
  const marks = createNetworkMarks({ world, geometry: geometryFor(world) });
  for (const t of transits) marks.drawConcealedTransit(ctx, t, tMs, events);
  marks.draw(ctx, tMs, events);
  return canvas.toBuffer('image/png');
}
const blankPng = () => { const c = createCanvas(SIZE, SIZE); const x = c.getContext('2d'); x.fillStyle = '#080C13'; x.fillRect(0, 0, SIZE, SIZE); return c.toBuffer('image/png'); };
const cites = (events, marks) => {
  const ids = new Set(events.map((e) => e.eventId));
  for (const m of marks) { assert.ok(m.eventIds.length > 0, m.id); for (const id of m.eventIds) assert.ok(ids.has(id), `${m.id} cites ${id}`); }
};

test('K1 concealed penetration: only silent, dead trees; blocks inside the node make no ripple', () => {
  const world = chainWorld();
  const events = runChain();
  const { marks, concealedBlockIds } = traceNetworkMarks(events, world);
  cites(events, marks);
  const concealed = marks.filter((m) => m.kind === 'concealedPenetration');
  assert.ok(concealed.length >= 3);
  const blocks = events.filter((e) => e.type === 'activation_blocked' && e.nodeId === 'N3');
  assert.ok(blocks.length >= 1);
  for (const b of blocks) assert.ok(concealedBlockIds.has(b.eventId));
  assert.ok(!concealed.some((m) => m.linkId === 'N3H'), 'a wave that reaches His is audible, not concealed');
  // Launches are real: each cites its launch event first.
  for (const m of concealed) assert.equal(events.find((e) => e.eventId === m.eventIds[0]).type, 'conduction_launched');
  // The same trace with every site audible has no concealed marks (v1.0 worlds never produce them).
  const loud = { ...world, nodes: world.nodes.map((n) => ({ ...n, audible: true })) };
  assert.equal(traceNetworkMarks(events, loud).marks.filter((m) => m.kind === 'concealedPenetration').length, 0);
  // Drawing: a concealed transit is handled (dim dashed) and leaves ink; a normal one is declined.
  const transit = events.find((e) => e.eventId === concealed[0].eventIds[0]);
  const mid = (transit.departureMs + transit.arrivalMs) / 2;
  const handler = createNetworkMarks({ world, geometry: geometryFor(world) });
  const canvas = createCanvas(SIZE, SIZE);
  assert.equal(handler.drawConcealedTransit(canvas.getContext('2d'), transit, mid, events), true);
  const normal = events.find((e) => e.type === 'conduction_launched' && e.linkId === 'N3H');
  assert.equal(handler.drawConcealedTransit(canvas.getContext('2d'), normal, normal.tMs + 5, events), false);
  assert.ok(!paint(world, events, mid, { transits: [transit] }).equals(blankPng()));
});

test('K2 lesion beads and glow follow lesion_changed progress, from events only', () => {
  const { world, events } = runLesionRing();
  const { marks } = traceNetworkMarks(events, world);
  cites(events, marks);
  const lesions = marks.filter((m) => m.kind === 'lesion');
  assert.ok(lesions.length >= 6);
  assert.ok(lesions.every((m, i) => i === 0 || m.progress >= lesions[i - 1].progress));
  assert.equal(lesions.at(-1).progress, 1);
  assert.equal(paint(world, events, 900).equals(blankPng()), true, 'no lesion before the first step');
  const early = paint(world, events, 1600); const mid = paint(world, events, 2600); const done = paint(world, events, 4000);
  assert.ok(!early.equals(blankPng()) && !mid.equals(early) && !done.equals(mid));
  // Glow is transient; beads persist.
  assert.ok(!paint(world, events, 3900).equals(blankPng()));
  const stripped = events.filter((e) => e.type !== 'lesion_changed');
  assert.ok(paint(world, stripped, 4000).equals(blankPng()), 'no event, no mark');
});

test('K3 phase_modulated arc brightens for 200 ms between the two foci', () => {
  const { world, events } = runHemiola();
  const { marks } = traceNetworkMarks(events, world);
  cites(events, marks);
  const arcs = marks.filter((m) => m.kind === 'phaseArc');
  assert.ok(arcs.length >= 3);
  for (const m of arcs) {
    const source = events.find((e) => e.eventId === m.eventIds[1]);
    assert.equal(source.nodeId, m.fromNodeId);
    assert.equal(m.toNodeId, 'B');
  }
  const t = arcs[0].tMs;
  const blank = blankPng();
  assert.ok(!paint(world, events, t + 60).equals(blank));
  for (const probe of [t - 1, t + 60, t + PHASE_ARC_MS + 5, t + 1000]) {
    const alive = arcs.some((m) => m.tMs <= probe && probe - m.tMs < PHASE_ARC_MS);
    assert.equal(paint(world, events, probe).equals(blank), !alive, `t=${probe}`);
  }
});

test('K4 mixed-source capture draws two half rings in the two incoming colours', () => {
  const { world, events } = runFusion();
  const { marks } = traceNetworkMarks(events, world);
  cites(events, marks);
  const fusion = marks.filter((m) => m.kind === 'fusion');
  assert.equal(fusion.length, 1);
  const f = fusion[0];
  assert.equal(f.nodeId, 'R1');
  assert.equal(f.tMs, 60);
  assert.deepEqual([...f.categories].sort(), ['link:L0', 'stimulus']);
  assert.equal(events.find((e) => e.eventId === f.eventIds[0]).source, 'mixed');
  assert.ok(!paint(world, events, 80).equals(blankPng()));
  assert.ok(paint(world, events, 400).equals(blankPng()));
});

test('K5 double potential at a completed line: two rings, separated by the measured interval', () => {
  const { world, events } = runLesionRing();
  const { marks } = traceNetworkMarks(events, world);
  cites(events, marks);
  const dp = marks.filter((m) => m.kind === 'doublePotential');
  assert.equal(dp.length, 1);
  const act = (id) => events.find((e) => e.eventId === id);
  assert.equal(dp[0].nodeId, 'R3');
  assert.equal(dp[0].intervalMs, act(dp[0].eventIds[1]).tMs - act(dp[0].eventIds[0]).tMs);
  assert.equal(act(dp[0].eventIds[2]).type, 'link_changed');
  assert.equal(dp[0].intervalMs, 420);
  assert.ok(doublePotentialGapPx(420) > doublePotentialGapPx(60));
  assert.ok(doublePotentialGapPx(1e9) <= 14 && doublePotentialGapPx(0) === 3);
  const second = dp[0].eventIds[1];
  const without = events.filter((e) => e.eventId !== second);
  assert.ok(!paint(world, events, dp[0].tMs + 40).equals(paint(world, without, dp[0].tMs + 40)), 'rings drawn only because of the events');
});

test('K6 entrainment: a return within 20 ms closes a gold arc; a failed capture draws nothing', () => {
  const { world, events } = runEntrainment(250);
  const { marks } = traceNetworkMarks(events, world);
  cites(events, marks);
  const ent = marks.filter((m) => m.kind === 'entrainment');
  assert.equal(ent.length, 1);
  assert.equal(ent[0].nodeId, 'R0');
  assert.equal(ent[0].tclMs, 261);
  assert.equal(ent[0].ppiMs, 261);
  assert.ok(Math.abs(ent[0].deltaMs) <= 20);
  const lastPulse = events.filter((e) => e.type === 'stimulus_attempted' && e.triggerId.startsWith('pace#')).at(-1);
  assert.equal(ent[0].tMs - lastPulse.tMs, ent[0].ppiMs);
  const blank = blankPng();
  const a = paint(world, events, ent[0].tMs + 60); const b = paint(world, events, ent[0].tMs + 300);
  assert.ok(!a.equals(blank) && !b.equals(blank) && !a.equals(b), 'arc is closing');
  assert.ok(paint(world, events, ent[0].tMs + 1000).equals(blank));
  // Pacing at 200 ms cannot capture a 170 ms ERP site with this phase; no capture, no mark.
  const failed = runEntrainment(160);
  assert.equal(traceNetworkMarks(failed.events, failed.world).marks.filter((m) => m.kind === 'entrainment').length, 0);
});

// ---- integration with the existing Network renderer
function rendererFor(world, size = 300) {
  const image = createCanvas(size, size);
  const canvas = { get width() { return image.width; }, set width(v) { image.width = v; }, get height() { return image.height; },
    set height(v) { image.height = v; }, getContext: (t, o) => image.getContext(t, o),
    getBoundingClientRect: () => ({ width: size, height: size }),
    ownerDocument: { createElement: () => createCanvas(1, 1), defaultView: { devicePixelRatio: 1 } } };
  return { renderer: createRenderer(canvas, world), image };
}

test('K7 renderer integration: concealed transits and lesions appear, overlay hook runs, v1 frames unchanged', () => {
  const world = chainWorld();
  const engine = createEngine({ processingBudget: 1e6 });
  engine.reset(world, 'c');
  engine.enqueue({ commandId: 'p', runId: 'c', type: 'stimulateTrain', nodeId: 'A', startMs: 0, cycleMs: 300, count: 8, label: 'pace', tMs: 0 });
  const events = engine.advanceTo(3000);
  const analysis = traceNetworkMarks(events, world);
  const pen = analysis.marks.find((m) => m.kind === 'concealedPenetration' && m.linkId === 'N23');
  const mid = (pen.tMs + pen.endMs) / 2;
  const snap = engine.readAt(mid);
  assert.ok(snap.activeTransits.some((t) => t.transitId === pen.transitId));
  const withMarks = rendererFor(world); withMarks.renderer.render(snap, events, mid);
  const loud = rendererFor({ ...world, nodes: world.nodes.map((n) => ({ ...n, audible: true })) }); loud.renderer.render(snap, events, mid);
  assert.ok(!withMarks.image.toBuffer('image/png').equals(loud.image.toBuffer('image/png')), 'concealed transit is drawn differently');
  let called = null;
  withMarks.renderer.setOverlay((ctx, info) => { called = info; });
  withMarks.renderer.render(snap, events, mid);
  assert.equal(called.tMs, mid);
  const p = withMarks.renderer.linkPoint('AN1', 0.5);
  const a = withMarks.renderer.nodePosition('A'); const n1 = withMarks.renderer.nodePosition('N1');
  assert.ok(Math.hypot(p.x - (a.x + n1.x) / 2, p.y - (a.y + n1.y) / 2) < 1e-6);
  assert.equal(withMarks.renderer.linkPoint('nope', 0.5), null);

  const lesion = runLesionRing();
  const eng = createEngine({ processingBudget: 1e6 });
  eng.reset(lesion.world, 'l');
  for (const c of [{ commandId: 'S1', type: 'stimulate', nodeId: 'R0', tMs: 0 }, { commandId: 'S2', type: 'stimulate', nodeId: 'R0', tMs: 240 },
    { commandId: 'abl', type: 'ablate', target: 'L3', durationMs: 2000, completeness: 1, tMs: 1000 }]) eng.enqueue({ runId: 'l', ...c });
  const levents = eng.advanceTo(3500);
  const frame = (list) => { const r = rendererFor(lesion.world); r.renderer.render(eng.readAt(2600), list, 2600); return r.image.toBuffer('image/png'); };
  assert.ok(!frame(levents).equals(frame(levents.filter((e) => e.type !== 'lesion_changed'))), 'lesion beads visible mid-formation');
});
