import {echoWorld,run} from './echo.mjs';
import fs from 'fs';
const pts=[];
for (let cs=440; cs>=200; cs-=4){
  const st=[]; for(let k=0;k<8;k++) st.push([200+600*k,'CSp']); const last=200+600*7; st.push([last+cs,'CSp']);
  const ev=run(echoWorld({fp:300,sl:160}),st,last+cs+900);
  const A=ev.filter(x=>x.type==='activation'&&x.nodeId==='CSp');
  const H=ev.filter(x=>x.type==='activation'&&x.nodeId==='H');
  const a1=A.find(x=>Math.abs(x.tMs-last)<1), a2=A.find(x=>Math.abs(x.tMs-(last+cs))<1);
  const h1=H.find(x=>x.tMs>last&&x.tMs<last+cs);
  const h2=H.find(x=>x.tMs>last+cs && (!a2 || x.causeIds));
  const h2b= a2? H.find(x=>x.tMs>a2.tMs):null;
  pts.push({cs, captured:!!a2, a1h1:h1? h1.tMs-last:null, a2h2: (a2&&h2b&&h2b.tMs-a2.tMs<400)? +(h2b.tMs-a2.tMs).toFixed(1):null, h1h2:(h1&&a2&&h2b&&h2b.tMs-a2.tMs<400)? +(h2b.tMs-h1.tMs).toFixed(1):null});
}
fs.writeFileSync('s1s2.json',JSON.stringify(pts)); console.log(pts.map(p=>`${p.cs}:${p.captured?'':'X'}${p.a2h2}/${p.h1h2}`).join(' '));
