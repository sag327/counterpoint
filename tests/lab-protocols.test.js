import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isV11World, pacingCommands, protocolCsv, rangeValues, runProtocol, runProtocolSync } from '../src/lab/protocols.js';
import { createProtocolRunner, installProtocolWorker } from '../src/lab/worker.js';
import { circulationWorld } from '../src/worlds/circulation.js';
import { chainWorld, entryRingWorld, hemiolaWorld } from './engine-v11-scenes.js';
import { ECHO_LABELS, ECHO_SITES, echoPlateWorld, echoV11World } from './lab-worlds.js';

const echoS1S2 = step => ({
  type: 's1s2', siteId: 'CSp', driveCycleMs: 600, driveCount: 8, s2: { fromMs: 440, toMs: 200, stepMs: step }, sites: ECHO_SITES, labels: ECHO_LABELS,
});
const ringInduction = [{ commandId: 'S1', tMs: 0, type: 'stimulate', nodeId: 'R0' }, { commandId: 'S2', tMs: 240, type: 'stimulate', nodeId: 'R0' }];

test('Oracle: S1–S2 on the Echo plate world reproduces plate 6 (4 ms grid from 440 ms)', () => {
  const result = runProtocolSync(echoPlateWorld(), echoS1S2(4));
  const { jump, erps, conductionErp } = result.summary;
  // Jump at the first S2 below 300 on this grid (296), ≈ +178 ms.
  assert.equal(jump.fromCouplingMs, 300);
  assert.equal(jump.couplingMs, 296);
  assert.ok(Math.abs(jump.jumpMs - 178) < 1, `${jump.jumpMs}`);
  const inRange = (value, lo, hi) => assert.ok(value >= lo && value <= hi, `${value} outside ${lo}–${hi}`);
  inRange(erps.FP.erpMs, 296, 300);
  inRange(erps.FP.upperMs, 296, 300);
  inRange(erps.SP.erpMs, 232, 236);
  inRange(conductionErp.erpMs, 232, 236);
  inRange(erps.CSp.erpMs, 228, 232);
  inRange(erps.CSp.upperMs, 228, 232);
  assert.equal(result.text.startsWith('Jump of 178 ms at 296 ms'), true);
  // AH rises smoothly by less than 40 ms per step before the jump (Echo oracle).
  const fast = result.rows.filter(row => row.s2Ms >= 300).map(row => row.a2h2Ms);
  for (let i = 1; i < fast.length; i++) assert.ok(fast[i] - fast[i - 1] < 40);
  assert.equal(result.rows.find(row => row.s2Ms === 300).a2h2Ms, 110);
  // Echoes after the jump; circulation continues through the tail.
  assert.ok(result.summary.echoCouplingsMs.includes(296));
  assert.ok(result.summary.sustainedCouplingsMs.includes(260));
});

test('S1–S2 at 1 ms: the thresholds are the closed-form ones (FP < 300, SP < 240, CSp < 230)', () => {
  const result = runProtocolSync(echoPlateWorld(), { ...echoS1S2(1), s2: { fromMs: 310, toMs: 225, stepMs: 1 } });
  const { erps, jump } = result.summary;
  assert.deepEqual([erps.FP.erpMs, erps.SP.erpMs, erps.CSp.erpMs], [299, 239, 229]);
  assert.equal(jump.couplingMs, 299);
  assert.ok(Math.abs(jump.jumpMs - 176.696) < 0.002);
});

test('S1–S2 is deterministic, uses trains on 1.1.0 worlds, and exports CSV', () => {
  const a = runProtocolSync(echoV11World(), echoS1S2(8));
  const b = runProtocolSync(echoV11World(), echoS1S2(8));
  assert.deepEqual(a, b);
  assert.ok(a.summary.jump !== null);
  assert.equal(isV11World(echoV11World()), true);
  assert.equal(isV11World(echoPlateWorld()), false);
  assert.equal(pacingCommands(echoV11World(), { id: 'T', nodeId: 'CSp', startMs: 0, cycleMs: 600, count: 8 })[0].type, 'stimulateTrain');
  assert.equal(pacingCommands(echoPlateWorld(), { id: 'T', nodeId: 'CSp', startMs: 0, cycleMs: 600, count: 8 }).length, 8);
  const csv = protocolCsv(a).split('\n');
  assert.equal(csv[0].split(',')[0], 's2Ms');
  assert.equal(csv.length, a.rows.length + 2);
  assert.deepEqual(rangeValues({ fromMs: 300, toMs: 290, stepMs: 5 }), [300, 295, 290]);
});

test('S3 scan with fixed S2', () => {
  const result = runProtocolSync(echoPlateWorld(), { ...echoS1S2(4), s2: 320, s3: { fromMs: 340, toMs: 240, stepMs: 20 } });
  assert.equal(result.columns[1], 's3Ms');
  assert.ok(result.rows.every(row => row.s2Ms === 320));
});

test('Incremental pacing on the §E chain: 1:1, Wenckebach and 2:1 with the Wenckebach cycle marked', () => {
  const result = runProtocolSync(chainWorld(), { type: 'incremental', siteId: 'A', outputId: 'H', cycles: { fromMs: 340, toMs: 250, stepMs: 10 }, beats: 32 });
  const at = cycle => result.rows.find(row => row.cycleMs === cycle);
  assert.equal(at(320).ratio, '1:1');
  assert.equal(at(300).ratio, '4:3');
  assert.equal(at(300).kind, 'wenckebach');
  assert.equal(at(250).ratio, '2:1');
  assert.equal(result.summary.wenckebachCycleMs, 310);
});

test('Burst: a two-pulse burst into the ring sustains; a slow burst into Echo does not', () => {
  const ring = runProtocolSync(circulationWorld, { type: 'burst', siteId: 'R0', cycleMs: 240, count: 2 });
  assert.equal(ring.rows[0].sustained, true);
  assert.equal(ring.rows[0].cycleAfterMs, 480);
  const echo = runProtocolSync(echoPlateWorld(), { type: 'burst', siteId: 'CSp', cycleMs: 400, count: 6 });
  assert.equal(echo.rows[0].sustained, false);
});

test('Resetting and entrainment on a circulating ring', () => {
  const reset = runProtocolSync(entryRingWorld(), {
    type: 'resetting', siteId: 'R0', induction: [{ commandId: 'S', tMs: 0, type: 'stimulate', nodeId: 'R4' }],
    couplings: { fromMs: 300, toMs: 200, stepMs: 10 },
  });
  const returns = reset.rows.filter(row => row.captured && !row.terminated).map(row => row.returnMs);
  assert.ok(returns.length >= 5);
  // Entry slowing: the return cycle rises as the extrastimulus gets earlier (§B).
  for (let i = 1; i < returns.length; i++) assert.ok(returns[i] >= returns[i - 1] - 0.001, returns.join(' '));
  const ent = runProtocolSync(circulationWorld, { type: 'entrainment', candidates: ['R0', 'R4'], induction: ringInduction, circuitIds: ['R0', 'R2', 'R4', 'R6'] });
  for (const row of ent.rows) {
    assert.equal(row.tclMs, 480);
    assert.equal(row.pacingCycleMs, 460);
    assert.equal(row.captured, true);
    assert.equal(row.ppiMinusTclMs, 0);
  }
});

test('Coupling sweep reproduces the §D plateaus (2:3, 3:4 and the return of 2:3)', () => {
  const values = [0, 0.1, 0.17, 0.2, 0.215, 0.23, 0.25];
  const result = runProtocolSync(hemiolaWorld(0.1), { type: 'couplingSweep', couplingId: 'AB', values });
  const fractions = Object.fromEntries(result.rows.map(row => [row.amplitude, row.fraction]));
  assert.equal(fractions[0], null);
  assert.equal(fractions[0.17], '2:3');
  assert.equal(fractions[0.2], '2:3');
  assert.equal(fractions[0.215], '3:4');
  assert.equal(fractions[0.23], '2:3');
});

test('runProtocol yields between steps, reports progress and honours abort', async () => {
  const progress = [];
  let yields = 0;
  const result = await runProtocol(echoPlateWorld(), echoS1S2(40), {
    onProgress: p => progress.push(p.done), sliceMs: 0, yieldFn: () => { yields++; return Promise.resolve(); },
  });
  assert.equal(result.rows.length, 7);
  assert.deepEqual(progress, [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(yields >= 6);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runProtocol(echoPlateWorld(), echoS1S2(40), { signal: controller.signal }), { name: 'AbortError' });
});

test('Worker wrapper: message protocol, and fallback to the main thread', async () => {
  // An in-process pair of message ports stands in for a module Worker.
  class FakeWorker extends EventTarget {
    constructor() {
      super();
      this.scope = new EventTarget();
      this.scope.postMessage = data => queueMicrotask(() => this.dispatchEvent(Object.assign(new Event('message'), { data: structuredClone(data) })));
      installProtocolWorker(this.scope);
    }
    postMessage(data) {
      queueMicrotask(() => this.scope.dispatchEvent(Object.assign(new Event('message'), { data: structuredClone(data) })));
    }
    terminate() {}
  }
  const runner = createProtocolRunner({ workerUrl: 'lab-worker.js', WorkerClass: FakeWorker });
  assert.equal(runner.mode, 'worker');
  const seen = [];
  const viaWorker = await runner.run(echoPlateWorld(), echoS1S2(40), { onProgress: p => seen.push(p.done) });
  assert.equal(seen.at(-1), 7);
  assert.deepEqual(viaWorker, runProtocolSync(echoPlateWorld(), echoS1S2(40)));
  const main = createProtocolRunner({ workerUrl: null });
  assert.equal(main.mode, 'main');
  assert.deepEqual(await main.run(echoPlateWorld(), echoS1S2(40)), viaWorker);
  const broken = createProtocolRunner({ workerUrl: 'x', WorkerClass: class { constructor() { throw new Error('no module workers'); } } });
  assert.equal(broken.mode, 'main');
});
