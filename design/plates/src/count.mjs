import {echoWorld,run} from './echo.mjs';
for (let cs=330; cs>=240; cs-=10){
  const st=[]; for(let k=0;k<8;k++) st.push([200+600*k,'CSp']); const last=200+600*7; st.push([last+cs,'CSp']);
  const ev=run(echoWorld(),st,last+cs+20000);
  const c=ev.filter(x=>x.type==='activation'&&x.nodeId==='CSp'&&x.tMs>last+cs).map(x=>x.tMs);
  const v=ev.filter(x=>x.type==='activation'&&x.nodeId==='V'&&x.tMs>last+cs).map(x=>x.tMs);
  console.log(cs,'CSp after S2:',c.length,'last',c.at(-1)-last-cs, 'V',v.length, 'cyc', c.length>3?c.at(-1)-c.at(-2):'-', 'CSp-V', v.length>3? (v.at(-1)-c.at(-1)).toFixed(0):'-');
}
