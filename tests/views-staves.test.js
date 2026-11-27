import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { SYNTHETIC_LABEL, createStaves, kernelAt, kernelSupportMs, nearestSimpleRatio } from '../src/visuals/staves.js';
import { echoStaves, runEcho } from './views-scenes.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas` : '@napi-rs/canvas');
const echo = runEcho();

test('S1 kernels are deterministic, finite, biphasic and sized per tissue', () => {
  for (const tissue of ['atrial', 'hisPurkinje', 'ventricular', 'sinus', 'nodal', 'accessory']) {
    const support = kernelSupportMs(tissue);
    let lo = Infinity; let hi = -Infinity;
    for (let t = -support - 2; t <= support + 2; t += 0.25) {
      const v = kernelAt(tissue, t);
      assert.equal(v, kernelAt(tissue, t), 'same input, same output');
      assert.ok(Number.isFinite(v));
      lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    assert.ok(lo < -0.02 && hi > 0.02, `${tissue} is biphasic`);
    assert.equal(kernelAt(tissue, support + 1), 0);
    assert.equal(kernelAt(tissue, -support - 1), 0);
  }
  const peak = (tissue) => { let m = 0; for (let t = -60; t <= 60; t += 0.5) m = Math.max(m, Math.abs(kernelAt(tissue, t))); return m; };
  assert.ok(peak('hisPurkinje') < peak('atrial') && peak('atrial') < peak('ventricular'), 'His small, ventricle large');
  assert.ok(kernelSupportMs('hisPurkinje') * 2 <= 24 && kernelSupportMs('atrial') * 2 >= 40 && kernelSupportMs('ventricular') * 2 >= 80);
  // Pinned samples (constants of the kernel definitions).
  assert.ok(Math.abs(kernelAt('atrial', 0)) < 1e-12);
  assert.ok(Math.abs(kernelAt('atrial', 6) - 0.75 * Math.exp(-0.25) * Math.sin(6 / 5.5)) < 1e-4);
});

test('S2 caliper ratio math', () => {
  const r = (a, b, opts) => nearestSimpleRatio(a, b, opts);
  assert.equal(r(300, 300).text, '1:1');
  assert.equal(r(200, 300).text, '2:3');
  assert.equal(r(225, 300).text, '3:4');
  assert.equal(r(150, 300).text, '1:2');
  assert.equal(r(600, 300).text, '2:1');
  assert.equal(r(305, 300).text, '1:1');
  assert.ok(Math.abs(r(200, 300).errorMs) < 1e-9);
  assert.ok(Math.abs(r(310, 300).errorMs - 10) < 1e-9);
  assert.equal(r(0, 300), null);
  assert.equal(r(300, 0), null);
  const staves = createStaves({ staves: echoStaves });
  assert.equal(staves.readout(), null);
  staves.setCalipers(5000, 4800); // order is normalised
  const out = staves.readout(300);
  assert.deepEqual([out.a, out.b, out.intervalMs], [4800, 5000, 200]);
  assert.equal(out.ratio.text, '2:3');
  staves.setReference(400);
  assert.equal(staves.readout().ratio.text, '1:2');
  staves.clearCalipers();
  assert.equal(staves.readout(), null);
  assert.throws(() => staves.setCalipers(NaN, 1));
  assert.equal(staves.meta.synthetic, true);
  assert.equal(staves.meta.label, SYNTHETIC_LABEL);
});

test('S3 calipers read the real engine: A to V 1:1 in circulation, drive interval in the arpeggio', () => {
  const staves = createStaves({ staves: echoStaves });
  const at = (n, lo, hi) => echo.filter((e) => e.type === 'activation' && e.nodeId === n && e.tMs >= lo && e.tMs <= hi).map((e) => e.tMs);
  const cs = at('CSp', 6100, 7200);
  const out = staves.setCalipers(cs[0], cs[1]);
  assert.ok(Math.abs(out.intervalMs - 305) < 8);
  assert.equal(staves.readout(out.intervalMs).ratio.text, '1:1');
  // Drive: onset-to-onset 600 ms at CSp.
  const drive = at('CSp', 200, 4500);
  assert.equal(drive[1] - drive[0], 600);
});

test('S4 trace marks: one note head and one kernel per activation on a stave, nothing else', () => {
  const staves = createStaves({ staves: echoStaves });
  const marks = staves.traceMarks(echo);
  const ids = new Set(echo.map((e) => e.eventId));
  const on = echo.filter((e) => e.type === 'activation' && echoStaves.some((s) => s.nodeId === e.nodeId));
  assert.equal(marks.length, on.length * 2);
  for (const m of marks) { assert.ok(ids.has(m.eventIds[0])); assert.equal(echo.find((e) => e.eventId === m.eventIds[0]).tMs, m.tMs); }
  assert.ok(!marks.some((m) => m.nodeId === 'FP' || m.nodeId === 'S'), 'silent and unlisted sites have no stave');
});

test('S5 drawing is deterministic, honours pointer mapping and snapping, and reduced motion', () => {
  const draw = (extra = {}) => {
    const staves = createStaves({ staves: echoStaves });
    staves.setCalipers(5900, 6200);
    const canvas = createCanvas(1000, 560);
    staves.draw(canvas.getContext('2d'), { events: echo, presentedMs: 6500, width: 500, height: 280, dpr: 2, ...extra });
    return { staves, png: canvas.toBuffer('image/png') };
  };
  const a = draw(); const b = draw();
  assert.ok(a.png.equals(b.png));
  assert.ok(!a.png.equals(draw({ presentedMs: 6600 }).png));
  const { staves } = a;
  const x = staves.xAtTime(6500);
  assert.ok(Math.abs(staves.timeAtX(x) - 6500) < 1e-9);
  const onset = echo.find((e) => e.type === 'activation' && e.nodeId === 'V' && e.tMs > 6000).tMs;
  assert.equal(staves.snapToOnset(echo, onset + 2), onset);
  assert.equal(staves.snapToOnset(echo, onset + 500, 2), onset + 500);
  assert.ok(draw({ reducedMotion: true, showSyntheticLabel: true }).png.length > 0);
});
