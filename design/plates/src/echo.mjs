import { createEngine } from '/home/claude/sag327/counterpoint/src/engine/index.js';
const dl=(id,a,b,d,dec=null,both=true)=>({id,a,b,enabled:true,ab:{enabled:true,delayMs:d,decrement:dec},ba:{enabled:both,delayMs:d,decrement:dec}});
const N=(id,erp,auto=null)=>({id,erpMs:erp,recoveryTailMs:120,automaticity:auto});
export function echoWorld(p={}){
 return {worldId:'echo',nodes:[N('S',200,{cycleMs:800,firstAttemptMs:0,resetOnCapture:true}),N('HRA',230),N('CSp',230),N('FP',p.fp??340),N('SP',p.sp??240),N('LCP',250),N('H',p.h??250),N('V',250)],
 links:[dl('SH','S','HRA',25,null,false),dl('HC','HRA','CSp',30),dl('CF','CSp','FP',10),dl('FL','FP','LCP',30,{maxExtraMs:30,tauMs:100}),dl('CS','CSp','SP',50),dl('SL','SP','LCP',p.sl??120,{maxExtraMs:60,tauMs:120}),dl('LH','LCP','H',40,null,false),dl('HV','H','V',35,null,false)]};
}
export function run(world, stims, T){
 const e=createEngine({processingBudget:1e6}); e.reset(world,'r'); let i=0;
 for(const [t,n] of stims) e.enqueue({commandId:'c'+(i++),runId:'r',type:'stimulate',nodeId:n,tMs:t});
 return e.advanceTo(T);
}
if (process.argv[2]==='scan'){
 // S1 train from CSp 600ms x8 starting 200, S2 at last+cs; sinus will be overdriven? sinus 800 resets on capture
 for (let cs=420; cs>=220; cs-=10){
  const st=[]; for(let k=0;k<8;k++) st.push([200+600*k,'CSp']); const last=200+600*7; st.push([last+cs,'CSp']);
  const ev=run(echoWorld(),st,last+cs+3000);
  const acts=ev.filter(x=>x.type==='activation' && x.tMs>=last+cs);
  const seq=acts.slice(0,14).map(a=>a.nodeId[0]+(a.nodeId==='CSp'?'c':'')+'@'+Math.round(a.tMs-last-cs)).join(' ');
  const csp=acts.filter(a=>a.nodeId==='CSp').length, h=acts.filter(a=>a.nodeId==='H');
  console.log(cs, 'AH', h[0]?Math.round(h[0].tMs-(last+cs)):'-', 'CSp n',csp, seq);
 }
}
