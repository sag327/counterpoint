import {echoWorld,run} from './echo.mjs';
import fs from 'fs';
const st=[]; for(let k=0;k<8;k++) st.push([200+600*k,'CSp']); const last=200+600*7; st.push([last+270,'CSp']);
const ev=run(echoWorld({fp:300,sl:160}),st,last+270+2400);
fs.writeFileSync('echo_events.json',JSON.stringify({stims:st,events:ev}));
const a=ev.filter(x=>x.type==='activation'&&x.tMs>last+270);
const c=a.filter(x=>x.nodeId==='CSp').map(x=>x.tMs), v=a.filter(x=>x.nodeId==='V').map(x=>x.tMs);
console.log('CSp',c.map(Math.round).join(','));console.log('V',v.map(Math.round).join(','));
// sinus CSp->V
const b=ev.filter(x=>x.type==='activation'&&x.tMs>=1400&&x.tMs<1800).map(x=>x.nodeId+'@'+Math.round(x.tMs));console.log(b.join(' '));
console.log(ev.length, [...new Set(ev.map(e=>e.type))]);
