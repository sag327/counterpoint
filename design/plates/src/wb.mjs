import { createEngine } from '/home/claude/sag327/counterpoint/src/engine/index.js';
import { createConductionWorld } from '/home/claude/sag327/counterpoint/src/worlds/conduction.js';
import fs from 'fs';
const out={};
for (const cl of [600,450,400,370,350,330,310,300,280]){
 const w=createConductionWorld(); w.nodes.find(n=>n.id==='S').automaticity=null;
 const e=createEngine({processingBudget:1e6}); e.reset(w,'r');
 for(let k=0;k<120;k++) e.enqueue({commandId:'c'+k,runId:'r',type:'stimulate',nodeId:'A',tMs:100+k*cl});
 const ev=e.advanceTo(100+120*cl);
 const v=ev.filter(x=>x.type==='activation'&&x.nodeId==='H').map(x=>x.tMs);
 const a=ev.filter(x=>x.type==='activation'&&x.nodeId==='A').length;
 const rr=v.slice(1).map((t,i)=>+(t-v[i]).toFixed(2));
 out[cl]=rr; console.log(cl,'A',a,'H',v.length,'ratio',(v.length/a).toFixed(3),rr.slice(-10).map(Math.round).join(' '));
}
fs.writeFileSync('wb.json',JSON.stringify(out));
