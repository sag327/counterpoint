// III. Meter oracle: conduction ratios and AH within each group for drive cycles
// 600, 450, 400, 360, 330 and 300 ms (design/study-2-spec.md, "III. Meter").
// The expected AH sequences come from a hand recurrence of the feed-forward chain
// N1 -> N2 -> N3 -> H -> V (laws §A, v1.0 decrement, §B entry), driven only by the
// atrial capture times. The committed table below was read off that recurrence.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMeterWorld, meterPresentation, meterWorld } from '../src/worlds/meter.js';
import { acts, assertLaws, blocked, play, tick } from './studies-common.js';

const hold = meterPresentation.protocols.find(p => p.id === 'hold-tempo');
const START = 500;
const COUNT = 60;

// Hand recurrence of one feed-forward chain in integer ticks. Returns H capture tick per atrial capture (or null).
function chainRecurrence(world, atrialTicks) {
  const nodes = new Map(world.nodes.map(n => [n.id, n]));
  const links = new Map(world.links.map(l => [l.b, l]));
  const path = ['N1', 'N2', 'N3', 'H', 'V'];
  const state = new Map(path.map(id => [id, { until: null }]));
  const erpFor = (node, di) => {
    if (!node.restitution) return tick(node.erpMs);
    if (di === null) return tick(node.restitution.erpMaxMs);
    const r = node.restitution;
    return Math.min(tick(r.erpMaxMs), Math.max(tick(r.erpMinMs), Math.round(tick(r.erpMaxMs) - tick(r.amplitudeMs) * Math.exp(-di / tick(r.tauMs)))));
  };
  const lawExtra = (law, x) => Math.round(tick(law.maxExtraMs) * Math.exp(-x / tick(law.tauMs)));
  return atrialTicks.map(t0 => {
    let t = t0 + tick(links.get('N1').ab.delayMs);
    let hAt = null;
    for (let i = 0; i < path.length; i++) {
      const s = state.get(path[i]);
      if (s.until !== null && t < s.until) return { h: hAt, blockedAt: path[i] };
      const di = s.until === null ? null : t - s.until;
      s.until = t + erpFor(nodes.get(path[i]), di);
      if (path[i] === 'H') hAt = t;
      if (i === path.length - 1) break;
      const next = links.get(path[i + 1]).ab;
      const source = next.decrement && di !== null ? lawExtra(next.decrement, di) : 0;
      const nominal = t + tick(next.delayMs) + source;
      const until = state.get(path[i + 1]).until;
      const entry = next.entry && until !== null && nominal >= until ? lawExtra(next.entry, nominal - until) : 0;
      t = nominal + entry;
    }
    return { h: hAt, blockedAt: null };
  });
}

// Steady group (from pulse 24 on) as the conducted count per period and the AH (ms, 0.1 ms) of each beat in it.
const TABLE = {
  600: { ratio: '1:1' },
  450: { ratio: '1:1' },
  400: { ratio: '10:9' },
  360: { ratio: '4:3' },
  330: { ratio: '3:2' },
  300: { ratio: '2:1' },
};

function groupOf(pattern) {
  const tail = pattern.slice(24);
  for (let p = 1; p <= 14; p++) if (tail.every((c, i) => c === tail[i % p])) return p;
  return null;
}

for (const [cycleText, { ratio }] of Object.entries(TABLE)) {
  const cycle = Number(cycleText);
  test(`Meter drive ${cycle} ms: ratio ${ratio}, AH within each group matches the hand recurrence`, () => {
    const world = createMeterWorld();
    const events = play(world, hold.commands(cycle, COUNT, START), START + cycle * (COUNT + 1));
    const atrial = acts(events, 'HRA').map(a => tick(a.tMs));
    const expected = chainRecurrence(world, atrial);
    const hTimes = acts(events, 'H').map(a => tick(a.tMs));
    assert.deepEqual(hTimes, expected.filter(e => e.h !== null).map(e => e.h), 'every H capture tick');
    // Pulses from START on: conducted or not, and the group period.
    const pulses = expected.map((e, i) => ({ ...e, t: atrial[i] })).filter(e => e.t >= tick(START));
    assert.equal(pulses.length, COUNT, 'the atrium captures every pulse');
    const pattern = pulses.map(e => e.h !== null);
    const period = groupOf(pattern);
    const conducted = pattern.slice(24, 24 + period).filter(Boolean).length;
    assert.equal(`${period}:${conducted}`, ratio);
    // Within a group AH lengthens beat by beat (Wenckebach), and every drop is in the silent nodal chain.
    if (period > 1) {
      const start = 24 + pattern.slice(24).indexOf(false) + 1;
      const group = pulses.slice(start, start + period - 1).map(e => e.h - e.t);
      for (let i = 1; i < group.length; i++) assert.ok(group[i] > group[i - 1], `AH grows in the group: ${group}`);
      for (const e of pulses.slice(24)) if (e.h === null) assert.match(e.blockedAt, /^N[123]$/);
      for (const b of blocked(events).filter(b => b.tMs >= START)) assert.match(b.nodeId, /^N[123]$/);
    }
    assertLaws(meterWorld, events);
  });
}

test('Meter progression: as the drive shortens the group shrinks monotonically, from 1:1 to 2:1 through 5:4', () => {
  const ratios = [];
  for (let cycle = 420; cycle >= 340; cycle -= 5) {
    const world = createMeterWorld();
    const events = play(world, hold.commands(cycle, COUNT, START), START + cycle * (COUNT + 1));
    const atrial = acts(events, 'HRA').map(a => tick(a.tMs)).filter(t => t >= tick(START));
    const pattern = chainRecurrence(world, acts(events, 'HRA').map(a => tick(a.tMs))).slice(-COUNT).map(e => e.h !== null);
    assert.equal(atrial.length, COUNT);
    const period = groupOf(pattern);
    ratios.push(period === 1 ? 99 : period ?? 15); // 1:1 has no drop (99); no period up to 14 is a long group (15)
  }
  assert.ok(ratios.includes(5), `5:4 appears: ${ratios}`);
  for (let i = 1; i < ratios.length; i++) assert.ok(ratios[i] <= ratios[i - 1], `monotone: ${ratios}`);
});

test('Meter Sudden: His ERP 420 drops every other beat at 410 ms with no prolongation before the drop', () => {
  const events = play(createMeterWorld({ sudden: true }), hold.commands(410, COUNT, START), START + 410 * (COUNT + 1));
  const late = acts(events, 'H').filter(a => a.tMs > START + 24 * 410);
  const ah = late.map(a => (a.tMs - START) % 410);
  assert.ok(ah.every(v => Math.abs(v - ah.at(-1)) < 0.5), `constant AH (settled within 0.5 ms): ${ah}`);
  const blocks = blocked(events, 'H').filter(b => b.tMs > START + 24 * 410);
  assert.ok(blocks.length >= 15 && Math.abs(blocks.length - late.length) <= 1, '2:1 at His');
  assert.equal(blocked(events).filter(b => b.tMs > START + 24 * 410 && b.nodeId !== 'H').length, 0);
});
