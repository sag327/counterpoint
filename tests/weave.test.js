import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeaveTrace, openingAt } from '../src/prototypes/weave/model.js';

test('weave premature impulse blocks on blue without resetting its recovery and sustains return',()=>{
  const {events,engine}=createWeaveTrace();
  const block=events.find(e=>e.type==='activation_blocked');
  assert.equal(block.nodeId,'R1');assert.equal(block.tMs,300);assert.equal(block.refractoryUntilMs,360);
  assert.equal(engine.readAt(310).nodes.R1.lastActivationMs,60);
  assert.deepEqual(events.filter(e=>e.type==='activation'&&e.nodeId==='R0').map(e=>e.tMs),[0,240,720,1200,1680,2160,2640,3120,3600]);
  assert.ok(openingAt(engine.readAt(359).nodes.R1,359)>0);
  assert.equal(openingAt(engine.readAt(360).nodes.R1,360),0);
});
test('single and later impulses extinguish without sustained return',()=>{
  for(const coupling of [null,340]){
    const {events}=createWeaveTrace(coupling);
    assert.equal(events.filter(e=>e.type==='activation_blocked').length,0);
    assert.ok(events.filter(e=>e.type==='activation').every(e=>e.tMs<=580));
  }
});
