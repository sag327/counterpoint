import {echoWorld,run} from './echo.mjs';
for (const fp of [280,300]) for (const sl of [140,160,180]) {
 const res=[];
 for (let cs=400; cs>=200; cs-=10){
  const st=[]; for(let k=0;k<8;k++) st.push([200+600*k,'CSp']); const last=200+600*7; st.push([last+cs,'CSp']);
  const ev=run(echoWorld({fp,sl}),st,last+cs+10000);
  const h=ev.find(x=>x.type==='activation'&&x.nodeId==='H'&&x.tMs>last+cs);
  const c=ev.filter(x=>x.type==='activation'&&x.nodeId==='CSp'&&x.tMs>last+cs).map(x=>x.tMs);
  const echoes=c.filter(t=>t<last+cs+700).length;
  const sus=c.length>12 && (c.at(-1)-c.at(-2))<500;
  res.push(`${cs}:${h?Math.round(h.tMs-last-cs):'x'}${sus?'S'+(c.at(-1)-c.at(-2)):echoes?'e'+echoes:''}`);
 }
 console.log(fp,sl,res.join(' '));
}
