import {echoWorld,run} from './echo.mjs';
import fs from 'fs';
const pts=[];
for (let cs=420; cs>=236; cs-=4){
  const st=[]; for(let k=0;k<8;k++) st.push([200+600*k,'CSp']); const last=200+600*7; st.push([last+cs,'CSp']);
  const ev=run(echoWorld({fp:300,sl:160}),st,last+cs+800);
  const a2=ev.find(x=>x.type==='activation'&&x.nodeId==='CSp'&&x.tMs>=last+cs);
  const h=ev.find(x=>x.type==='activation'&&x.nodeId==='H'&&x.tMs>last+cs);
  if(a2&&h) pts.push([cs, +(h.tMs-a2.tMs).toFixed(1)]);
}
fs.writeFileSync('ah.json',JSON.stringify(pts)); console.log(pts.map(p=>p.join(':')).join(' '));
