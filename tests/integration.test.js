import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Engine} from '../src/engine/index.js';
import {createCirculationWorld} from '../src/worlds/circulation.js';
import {mapActivation} from '../src/music/index.js';
test('real engine exactly reproduces frozen A/B/C payloads and note identities',()=>{
 for(const name of ['A','B','C']){
 const fixture=JSON.parse(readFileSync(new URL(`./fixtures/v1/${name}.presentation.json`,import.meta.url)));
 const commands=JSON.parse(readFileSync(new URL(`./fixtures/v1/${name}.commands.json`,import.meta.url)));
 const engine=new Engine();engine.reset(createCirculationWorld(),commands[0].runId);commands.forEach(command=>engine.enqueue(command));
 const actual=[];for(let time=0;time<fixture.throughMs;time+=13.17)actual.push(...engine.advanceTo(time));actual.push(...engine.advanceTo(fixture.throughMs));
 assert.deepEqual(actual,fixture.events);
 const intents=actual.map(event=>mapActivation(event)).filter(Boolean);
 assert.deepEqual(intents.map(note=>[note.runId,note.eventId,note.tMs]),actual.filter(event=>event.type==='activation').map(event=>[event.runId,event.eventId,event.tMs]));
 assert.equal(intents.filter(note=>note.tMs===240).length,name==='A'?1:2);
 assert.equal(intents.filter(note=>note.tMs===300).length,name==='A'?0:1);
 }
});
