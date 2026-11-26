import { createEngine } from '/home/claude/sag327/counterpoint/src/engine/index.js';
import fs from 'fs';
const dl=(id,a,b,d,dec=null,both=true)=>({id,a,b,enabled:true,ab:{enabled:true,delayMs:d,decrement:dec},ba:{enabled:both,delayMs:d,decrement:dec}});
const N=(id,erp)=>({id,erpMs:erp,recoveryTailMs:120,automaticity:null});
const nodes=[], links=[];
for(let i=0;i<10;i++){nodes.push(N('R'+i,170)); links.push(dl('L'+i,'R'+i,'R'+((i+1)%10), i===4?45:24));}
nodes.push(N('N1',260),N('N2',280),N('N3',300),N('H',260),N('V',250));
links.push(dl('RN','R0','N1',20,null,false),dl('N12','N1','N2',30,{maxExtraMs:40,tauMs:100},false),dl('N23','N2','N3',30,{maxExtraMs:60,tauMs:120},false),dl('N3H','N3','H',30,null,false),dl('HV','H','V',35,null,false));
const e=createEngine({processingBudget:1e6}); e.reset({worldId:'ostinato',nodes,links},'r');
e.enqueue({commandId:'c1',runId:'r',type:'setLinkEnabled',linkId:'L9',enabled:false,tMs:0});
e.enqueue({commandId:'c2',runId:'r',type:'stimulate',nodeId:'R0',tMs:10});
e.enqueue({commandId:'c3',runId:'r',type:'setLinkEnabled',linkId:'L9',enabled:true,tMs:120});
let ev;
try{ ev=e.advanceTo(6000);}catch(err){console.log(err.message); process.exit(1)}
const act=ev.filter(x=>x.type==='activation');
const r0=act.filter(a=>a.nodeId==='R0').map(a=>a.tMs);
console.log('R0',r0.slice(-6).map(Math.round).join(','));
console.log('V',act.filter(a=>a.nodeId==='V').map(a=>Math.round(a.tMs)).slice(-6).join(','));
fs.writeFileSync('ost_events.json',JSON.stringify(ev));
