import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../src/engine/index.js';
import { createRestitutionConduction } from '../src/worlds/conduction.js';
import { musicTableFor, mapActivation } from '../src/music/index.js';

test('Conduction retains its resting sequence and slows the premature beat through the shared recovery laws', () => {
  const world = createRestitutionConduction();
  const engine = new Engine();
  engine.reset(world, 'conduction');
  engine.enqueue({ commandId: 'early', runId: 'conduction', type: 'stimulate', nodeId: 'A', tMs: 275 });
  const events = engine.advanceTo(600);
  const captures = events.filter(event => event.type === 'activation');
  assert.deepEqual(captures.slice(0, 6).map(event => event.nodeId), ['S', 'A', 'N', 'H', 'V1', 'V2']);
  assert.deepEqual(captures.slice(6).map(event => event.nodeId), ['A', 'N', 'H', 'V1', 'V2']);
  const [restedA, earlyA] = captures.filter(event => event.nodeId === 'A');
  assert.ok(earlyA.erpMs < restedA.erpMs);
  const [rested, premature] = events.filter(event => event.type === 'conduction_launched' && event.linkId === 'NH');
  assert.equal(rested.delayParts.sourceMs, 0);
  assert.ok(premature.delayParts.sourceMs > 0);
  assert.ok(events.some(event => event.delayParts?.entryMs > 0));
  assert.equal(musicTableFor(world), null);
  assert.ok(captures.every(event => mapActivation(event)));
});
