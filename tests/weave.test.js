import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeaveTrace, openingAt, createWeaveSamples, passageOpening, filamentOffset } from '../src/prototypes/weave/model.js';

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
test('zipper opens behind each wave, never ahead, in both directions',()=>{
  const samples=createWeaveSamples(createWeaveTrace(null),100);
  for(const [link,behind,ahead] of [[0,25,75],[7,75,25]]){
    assert.ok(passageOpening(samples[link][behind],30)>0);
    assert.equal(passageOpening(samples[link][ahead],30),0);
    assert.equal(passageOpening(samples[link][50],30),0);
    assert.ok(passageOpening(samples[link][50],45)>0);
  }
});
test('blocked arrival preserves destination recovery in the visual field',()=>{
  const withS2=createWeaveSamples(createWeaveTrace(),100)[0][100];
  const single=createWeaveSamples(createWeaveTrace(null),100)[0][100];
  for(const time of [300,310,359,360,400])assert.equal(passageOpening(withS2,time),passageOpening(single,time));
});
test('collision stops the swept opening and geometry joins around the ring',()=>{
  const trace=createWeaveTrace(null);
  const transit=trace.events.find(e=>e.type==='conduction_launched');
  const synthetic={...trace,events:[transit,{type:'conduction_collision',tMs:30,transitIds:[transit.transitId]}]};
  const samples=createWeaveSamples(synthetic,100);
  assert.equal(passageOpening(samples[0][75],50),0);
  assert.ok(passageOpening(samples[0][25],50)>0);
  for(let strand=0;strand<3;strand++)assert.ok(Math.abs(filamentOffset(0,strand,.8)-filamentOffset(Math.PI*2,strand,.8))<1e-10);
});
