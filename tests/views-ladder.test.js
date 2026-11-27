import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createLadder, normalizeTiers, traceMarks, tiersFromWorld } from '../src/visuals/ladder.js';
import { ECHO_S2, chainWorld, echoTiers, echoWorld, runChain, runEcho } from './views-scenes.js';

const require = createRequire(import.meta.url);
const canvasModule = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas` : '@napi-rs/canvas';
const { createCanvas } = require(canvasModule);

const echo = runEcho();
const byId = new Map(echo.map((e) => [e.eventId, e]));
const marks = traceMarks(echo, echoTiers);
const sites = new Set(['HRA', 'CSp', 'FP', 'SP', 'LCP', 'H', 'V']);

test('L1 trace parity: every mark names real events and no mark lacks one', () => {
  assert.ok(marks.length > 100);
  for (const mark of marks) {
    assert.ok(mark.eventIds.length >= 1, mark.id);
    for (const id of mark.eventIds) assert.ok(byId.has(id), `${mark.id} cites unknown ${id}`);
    const lead = byId.get(mark.eventIds[0]);
    if (mark.kind === 'activation') assert.equal(lead.tMs, mark.t0);
    if (mark.onLine) {
      assert.equal(lead.type, 'conduction_launched');
      assert.equal(lead.departureMs, mark.t0);
      assert.equal(mark.delayMs, lead.arrivalMs - lead.departureMs);
    }
  }
  // The reverse direction: every ladder-visible event is cited by some mark.
  const cited = new Set(marks.flatMap((m) => m.eventIds));
  for (const e of echo) {
    if (e.type === 'activation' && sites.has(e.nodeId)) assert.ok(cited.has(e.eventId), `activation ${e.eventId}`);
    if (e.type === 'stimulus_attempted' && e.source === 'stimulus') assert.ok(cited.has(e.eventId), e.eventId);
    if (e.type === 'conduction_launched' && sites.has(e.fromNodeId) && sites.has(e.toNodeId)) assert.ok(cited.has(e.eventId), e.eventId);
    if (e.type === 'conduction_collision') assert.ok(cited.has(e.eventId), e.eventId);
  }
  // Nodes outside the tiers (the sinus site) produce no marks.
  assert.ok(!marks.some((m) => m.from === 'S' || m.nodeId === 'S'));
  assert.deepEqual(traceMarks(echo, echoTiers), marks, 'deterministic');
});

test('L2 geometry: horizontal extent equals the launch delay and slope follows from it', () => {
  const ladder = createLadder({ tiers: echoTiers });
  const L = ladder.layout({ width: 1000, height: 520, windowMs: 3000, presentedMs: 5000 });
  const lines = marks.filter((m) => m.kind === 'conduction' && !m.pending);
  assert.ok(lines.length > 20);
  for (const mark of lines) {
    const g = ladder.markGeometry(mark, L);
    assert.ok(Math.abs((g.x1 - g.x0) - mark.delayMs * L.pxPerMs) < 1e-9);
    const rise = (g.y1 - g.y0);
    assert.ok(Math.abs(rise - (mark.y1 - mark.y0) * L.tierStep) < 1e-9);
    assert.equal(mark.direction, mark.y1 > mark.y0 ? 'antegrade' : 'retrograde');
  }
  // Same tier span, longer delay: shallower (smaller |dy/dx|). Slow pathway SP->LCP (180+) vs FP->LCP (30+).
  const slope = (m) => Math.abs((m.y1 - m.y0) * L.tierStep / (m.delayMs * L.pxPerMs));
  const slow = lines.find((m) => m.linkId === 'SL');
  const fast = lines.find((m) => m.linkId === 'FL');
  assert.ok(slow.delayMs > fast.delayMs && slope(slow) < slope(fast));
  // Playhead at 72%.
  assert.ok(Math.abs((L.playheadX - L.left) / L.plotWidth - 0.72) < 1e-12);
});

test('L3 classification: block bar, collision soft point, antegrade/retrograde', () => {
  const blocked = marks.filter((m) => m.kind === 'block' && m.onLine);
  assert.ok(blocked.length >= 1);
  const premature = blocked.find((m) => m.linkId === 'CF' && Math.abs(m.t0 - ECHO_S2) < 20);
  assert.ok(premature, 'premature touch blocks in the fast pathway');
  const outcome = byId.get(premature.eventIds[2]);
  assert.equal(outcome.type, 'activation_blocked');
  assert.equal(premature.concealed, false);
  const collisions = marks.filter((m) => m.kind === 'collision');
  assert.ok(collisions.length > 0);
  for (const mark of collisions) {
    const event = mark.eventIds.map((id) => byId.get(id)).find((e) => e.type === 'conduction_collision');
    assert.ok(event);
    assert.equal(mark.t1, event.tMs);
    const point = marks.find((m) => m.kind === 'collisionPoint' && m.eventIds[0] === event.eventId);
    assert.ok(point && point.t0 === event.tMs);
  }
  assert.ok(marks.some((m) => m.direction === 'retrograde' && m.kind === 'conduction'));
  // Silent nodal rows are open rings, audible rows pearls.
  const act = (id) => marks.find((m) => m.kind === 'activation' && m.nodeId === id);
  assert.equal(act('FP').audible, false);
  assert.equal(act('V').audible, true);
});

test('L4 concealed penetration: Wenckebach chain draws dashed lines that end without a bar', () => {
  const events = runChain();
  const tiers = normalizeTiers(['A', 'N1', 'N2', 'N3', 'H'], { silentSites: ['N1', 'N2', 'N3'] });
  const chain = traceMarks(events, tiers);
  const concealed = chain.filter((m) => m.kind === 'concealed');
  assert.ok(concealed.length >= 3);
  const blocks = events.filter((e) => e.type === 'activation_blocked' && e.nodeId === 'N3');
  assert.ok(blocks.length >= 1);
  for (const block of blocks) {
    const terminal = chain.find((m) => m.eventIds.includes(block.eventId) && m.onLine);
    assert.equal(terminal.kind, 'concealed', 'blocked wave inside the node leaves no bar');
  }
  assert.ok(!chain.some((m) => m.kind === 'block' && m.onLine));
  // A wave that conducts all the way to His is not concealed.
  const delivered = chain.filter((m) => m.kind === 'conduction' && m.to === 'H');
  assert.ok(delivered.length >= 3);
  // The same events with audible rows are never concealed.
  const loud = traceMarks(events, ['A', 'N1', 'N2', 'N3', 'H']);
  assert.ok(!loud.some((m) => m.kind === 'concealed'));
});

test('L5 tiersFromWorld reads audible and display.tiers', () => {
  const world = chainWorld();
  const t = tiersFromWorld(world);
  assert.equal(t.siteIndex.get('N2').audible, false);
  assert.equal(t.siteIndex.get('H').audible, true);
  const declared = tiersFromWorld({ ...world, display: { tiers: [{ label: 'Node', sites: ['N1', 'N2', 'N3'] }, { sites: ['A'] }] } });
  assert.equal(declared.tiers[0].sites.length, 3);
  assert.equal(declared.siteIndex.get('N3').tier, 0);
});

function render(args, size = [500, 300], dpr = 2) {
  const canvas = createCanvas(size[0] * dpr, size[1] * dpr);
  const ladder = createLadder({ tiers: echoTiers });
  ladder.draw(canvas.getContext('2d'), { events: echo, width: size[0], height: size[1], dpr, ...args });
  return canvas.toBuffer('image/png');
}

test('L6 drawing is deterministic, nonblank, and reduced motion pages instead of scrolling', () => {
  const a = render({ presentedMs: 5400 });
  assert.ok(a.equals(render({ presentedMs: 5400 })));
  assert.ok(!a.equals(render({ presentedMs: 5600 })));
  const ground = createCanvas(1000, 600); const gc = ground.getContext('2d');
  gc.fillStyle = '#080C13'; gc.fillRect(0, 0, 1000, 600);
  assert.ok(!a.equals(ground.toBuffer('image/png')));
  const ladder = createLadder({ tiers: echoTiers, reducedMotion: true });
  const p1 = ladder.layout({ width: 500, height: 300, presentedMs: 3100 });
  const p2 = ladder.layout({ width: 500, height: 300, presentedMs: 3900 });
  assert.equal(p1.t0, p2.t0, 'page does not scroll within a page');
  assert.ok(p2.playheadX > p1.playheadX);
  assert.ok(render({ presentedMs: 5400, reducedMotion: true }).length > 0);
});
