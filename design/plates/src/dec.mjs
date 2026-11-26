import {echoWorld,run} from './echo.mjs';
import fs from 'fs';
const pts=[];
for (let cs=440; cs>=240; cs-=8){
  const st=[]; for(let k=0;k<8;k++) st.push([200+600*k,'CSp']); const last=200+600*7; st.push([last+cs,'CSp']);
  const ev=run(echoWorld({fp:300,sl:160}),st,last+cs+1500);
  const sp=ev.filter(x=>x.type==='activation'&&x.nodeId==='SP');
  for(const L of ev.filter(x=>x.type==='conduction_launched'&&x.linkId==='SL'&&x.fromNodeId==='SP'&&x.departureMs>last-10)){
    const act=sp.find(a=>a.eventId===L.activationId); if(!act||act.priorActivationMs==null) continue;
    const rec=L.departureMs-(act.priorActivationMs+240);
    pts.push([+rec.toFixed(1), +(L.arrivalMs-L.departureMs).toFixed(1)]);
  }
}
const u=[...new Map(pts.map(p=>[p.join(),p])).values()];
fs.writeFileSync('dec.json',JSON.stringify(u)); console.log(u.length, u.slice(0,30).map(p=>p.join(':')).join(' '));
