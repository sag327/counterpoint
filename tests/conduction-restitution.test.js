import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/index.js';
import { runProtocolSync } from '../src/lab/protocols.js';
import { createRestitutionConduction } from '../src/worlds/conduction.js';
import { musicTableFor, mapActivation } from '../src/music/index.js';

test('Conduction retains its resting sequence and slows the premature beat through the shared recovery laws', () => {
  const world = createRestitutionConduction();
  const engine = new Engine();
  engine.reset(world, 'conduction');
  engine.enqueue({ commandId: 'early', runId: 'conduction', type: 'stimulate', nodeId: 'A', tMs: 275 });
  const events = engine.advanceTo(750);
  const captures = events.filter(event => event.type === 'activation');
  assert.deepEqual(captures.slice(0, 6).map(event => event.nodeId), ['S', 'A', 'N', 'H', 'V1', 'V2']);
  assert.deepEqual(captures.slice(6).map(event => event.nodeId), ['A', 'S', 'N', 'H', 'V1', 'V2']);
  const [restedA, earlyA] = captures.filter(event => event.nodeId === 'A');
  assert.ok(earlyA.erpMs < restedA.erpMs);
  const [rested, premature] = events.filter(event => event.type === 'conduction_launched' && event.linkId === 'AN' && event.fromNodeId === 'A');
  assert.equal(rested.delayParts.sourceMs, 0);
  assert.ok(premature.delayParts.sourceMs > 0);
  assert.ok(events.some(event => event.delayParts?.entryMs > 0));
  assert.equal(musicTableFor(world), null);
  assert.ok(captures.every(event => mapActivation(event)));
});

test('progressive AV delay precedes nodal block at intermediate atrial pacing rates', () => {
  const rows = runProtocolSync(createRestitutionConduction(), {
    type: 'incremental', siteId: 'A', outputId: 'H',
    cycles: { fromMs: 390, toMs: 310, stepMs: 10 }, beats: 48,
  }).rows;
  assert.deepEqual(rows.map(row => row.ratio), ['1:1', '8:7', '4:3', '4:3', '3:2', '3:2', '3:2', '3:2', '2:1']);
  assert.ok(rows.slice(1, -1).every(row => row.kind === 'wenckebach'));
  const engine = new Engine();
  engine.reset(createRestitutionConduction(), 'drive');
  engine.enqueue({ runId: 'drive', commandId: 'drive', type: 'stimulateTrain', nodeId: 'A',
    tMs: 200, startMs: 200, cycleMs: 360, count: 32, label: 'atrial drive' });
  const events = engine.advanceTo(12000);
  const blocks = events.filter(e => e.type === 'activation_blocked' && e.source === 'conduction');
  assert.ok(blocks.some(e => e.nodeId === 'N'));
  assert.ok(blocks.every(e => !['H', 'V1', 'V2'].includes(e.nodeId)));
});
