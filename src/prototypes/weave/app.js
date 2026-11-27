import { createWeaveTrace, openingAt, HORIZON } from './model.js';
import { createAudioMixer, mapActivation } from '../../music/index.js';
const $ = id => document.getElementById(id);
const canvas = $('ring'), ctx = canvas.getContext('2d');
let trace = createWeaveTrace(), mode = 'reentry', time = 0, playing = false, dilation = 4;
let anchor = 0, origin = 0, context, mixer, sound = false, generation = 0, audioRun, cursor = 0;
let width, height, radius, cx, cy;
const tau = Math.PI * 2;
const clock = () => context ? context.currentTime * 1000 : performance.now();
const color = i => i > 0 && i < 4 ? [123,174,213] : i > 4 ? [210,171,110] : [187,196,204];
const rgba = (c,a) => `rgba(${c.join(',')},${a})`;
function position(a, offset = 0) { return [cx + Math.sin(a)*(radius+offset), cy-Math.cos(a)*(radius+offset)]; }
function resize() {
  width = canvas.clientWidth; height = canvas.clientHeight;
  const dpr = Math.min(2,devicePixelRatio || 1);
  canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0);
  cx=width/2;cy=height*(width<520?.45:.49);radius=Math.min(width*.36,height*.39);
  draw();
}
function stop() { playing=false; mixer?.fence(); $('play').textContent='Play'; }
function start() {
  if(time>=HORIZON)time=0;
  origin=time; anchor=clock()+65;playing=true;
  audioRun=`play-${++generation}`;mixer?.beginRun(audioRun);
  cursor=trace.events.findIndex(e=>e.tMs>=time);if(cursor<0)cursor=trace.events.length;
  $('play').textContent='Pause';
}
function describe() {
  let title='The first impulse', body='A wave travels in both directions.';
  if(mode==='reentry' && time>=240) {
    if(time<300){title='A second impulse';body='Gold has gathered. Blue is still recovering.';}
    else if(time<420){title='One path holds';body='The blue entrance cannot conduct yet.';}
    else if(time<720){title='The long way around';body='The wave approaches blue from the other side.';}
    else{title='A rhythm returns';body='Each site recovers before the wave returns.';}
  } else if(mode==='late' && time>=340 && time<650){title='Both paths are ready';body='The later impulse travels both ways.';}
  else if(time>=(mode==='late'?650:480)){title='The ring settles';body='The opposing waves have met. No wave remains.';}
  if(time===0&&!playing){title='Ready to begin';body='Two paths. Different recovery.';}
  $('phase').textContent=title;$('explanation').textContent=body;
}
function draw() {
  if(!width)return;
  ctx.clearRect(0,0,width,height);
  const state=trace.engine.readAt(Math.round(time));
  // Local overlapping tapered footprints; no jitter and no radial loose ends.
  for(let strand=0;strand<3;strand++) {
    for(let i=0;i<8;i++) {
      const c=color(i), node=state.nodes[`R${i}`], opening=openingAt(node,time);
      const center=i*tau/8, half=tau/16;
      ctx.beginPath();
      for(let k=0;k<=70;k++) {
        const u=k/70, a=center-half+u*half*2;
        const taper=Math.pow(Math.sin(Math.PI*u),1.25);
        const bend=Math.sin(u*Math.PI*(strand===1?1.6:1.15)+i*.47+strand*2.2);
        const separation=(strand-1)*(.35+opening*11*taper)+opening*3*taper*bend;
        const p=position(a,separation);
        k===0?ctx.moveTo(...p):ctx.lineTo(...p);
      }
      ctx.strokeStyle=rgba(c,strand===1?.68:.43);ctx.lineWidth=strand===1?1.05:.75;
      ctx.shadowColor=rgba(c,.25);ctx.shadowBlur=5;ctx.stroke();ctx.shadowBlur=0;
    }
  }
  for(const transit of state.activeTransits) {
    const from=Number(transit.fromNodeId.slice(1)),to=Number(transit.toNodeId.slice(1));
    const direction=(to-from+8)%8===1?1:-1;
    const progress=(time-transit.departureMs)/(transit.arrivalMs-transit.departureMs);
    const angle=(from+direction*progress)*tau/8;
    for(let j=17;j>=0;j--) {
      const p=position(angle-direction*j*.0045);
      ctx.beginPath();ctx.arc(...p,j===0?2.3:1.35,0,tau);
      ctx.fillStyle=rgba([235,231,213],(1-j/18)*.9);ctx.shadowColor='#d9e9ff';ctx.shadowBlur=j===0?12:0;ctx.fill();
    }
    ctx.shadowBlur=0;
  }
  // A failed arrival dissipates locally; it never launches a replacement wave.
  for(const e of trace.events) {
    const age=time-e.tMs;
    if(e.type!=='activation_blocked'||age<0||age>65)continue;
    const a=Number(e.nodeId.slice(1))*tau/8;
    for(let s=-1;s<=1;s+=2){const p=position(a-.015-age*.00015,s*(2+age*.08));ctx.beginPath();ctx.arc(...p,1.6,0,tau);ctx.fillStyle=rgba([171,204,231],.8*(1-age/65));ctx.fill();}
  }
  $('timeline').value=Math.round(time);describe();
}
function frame() {
  if(playing) {
    const now=clock();time=Math.max(origin,Math.min(HORIZON,origin+(now-anchor)/dilation));
    if(sound&&mixer) {
      while(cursor<trace.events.length) {
        const event=trace.events[cursor], due=anchor+(event.tMs-origin)*dilation;
        if(due>now+120)break;
        cursor++;
        if(due>=now && event.type==='activation')mixer.schedule(mapActivation({...event,runId:audioRun}),due/1000);
      }
    }
    if(time>=HORIZON)stop();
    draw();
  }
  requestAnimationFrame(frame);
}
$('play').onclick=()=>{playing?stop():start();draw();};
$('restart').onclick=()=>{stop();time=0;start();draw();};
$('timeline').oninput=()=>{stop();time=Number($('timeline').value);draw();};
$('speed').onchange=()=>{const resume=playing;stop();dilation=Number($('speed').value);if(resume)start();};
$('sound').onclick=async()=>{
  const resume=playing;stop();
  if(!context){context=new AudioContext();mixer=createAudioMixer(context,{volume:.25});}
  await context.resume();sound=!sound;
  $('sound').textContent=sound?'Sound on':'Sound off';$('sound').setAttribute('aria-pressed',String(sound));
  if(resume)start();
};
document.querySelectorAll('[data-mode]').forEach(button=>{
  button.setAttribute('aria-pressed',String(button.dataset.mode===mode));
  button.onclick=()=>{stop();mode=button.dataset.mode;trace=createWeaveTrace(mode==='single'?null:mode==='late'?340:240);time=0;
    document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    start();draw();};
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
new ResizeObserver(resize).observe(canvas);resize();requestAnimationFrame(frame);
