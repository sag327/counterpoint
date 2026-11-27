import { createEngine } from '../../engine/index.js';
import { createCirculationWorld } from '../../worlds/circulation.js';

export const HORIZON = 3600;
export function createWeaveTrace(coupling = 240) {
  const world = createCirculationWorld();
  world.nodes.forEach((node, i) => { node.erpMs = i >= 1 && i <= 3 ? 300 : 200; });
  const engine = createEngine();
  const runId = 'weave';
  engine.reset(world, runId);
  engine.enqueue({ commandId: 's1', runId, type: 'stimulate', nodeId: 'R0', tMs: 0 });
  if (coupling !== null) engine.enqueue({ commandId: 's2', runId, type: 'stimulate', nodeId: 'R0', tMs: coupling });
  const events = engine.advanceTo(HORIZON);
  return { engine, events, world };
}

// Geometry follows ERP, not the engine's separate post-ERP recovery tail.
export function openingAt(node, time) {
  if (node.excitable || node.lastActivationMs === null) return 0;
  return Math.pow(Math.max(0, Math.min(1, (node.refractoryUntilMs - time) / node.erpMs)), 0.55);
}

const smooth = x => { x = Math.max(0, Math.min(1, x)); return x*x*(3-2*x); };

// Build once per experiment. These are presentation samples, not new engine sites.
// Each sample can open only after a real transit has physically crossed it.
export function createWeaveSamples(trace, steps = 70) {
  const launches = trace.events.filter(e => e.type === 'conduction_launched');
  const collisions = new Map();
  for (const e of trace.events) if (e.type === 'conduction_collision') {
    for (const id of e.transitIds) collisions.set(id, e.tMs);
  }
  const captures = new Set(trace.events.filter(e => e.type === 'activation').map(e => `${e.nodeId}/${e.tMs}`));
  return Array.from({length:8}, (_, link) => Array.from({length:steps+1}, (_, k) => {
    const u=k/steps, angle=(link+u)*Math.PI/4;
    const erp=trace.world.nodes[link].erpMs*(1-u)+trace.world.nodes[(link+1)%8].erpMs*u;
    const passages=[];
    for(const transit of launches) {
      if(transit.linkId!==`L${link}`)continue;
      const forward=transit.fromNodeId===`R${link}`;
      const progress=forward?u:1-u;
      const arrival=transit.departureMs+progress*(transit.arrivalMs-transit.departureMs);
      if(arrival>(collisions.get(transit.transitId)??Infinity))continue;
      const captured=captures.has(`${transit.toNodeId}/${transit.arrivalMs}`);
      // A failed arrival cannot reopen its refractory destination. Its visual
      // disturbance fades near that endpoint, preserving the prior recovery.
      const weight=captured?1:1-smooth((progress-.72)/.28);
      passages.push({arrival,erp,weight});
    }
    return {angle,u,passages};
  }));
}

export function passageOpening(sample,time) {
  let opening=0;
  for(const p of sample.passages) {
    const age=time-p.arrival;
    if(age<0||age>=p.erp)continue;
    // A small trailing shoulder makes the leading tip a continuous zipper.
    const value=smooth(age/12)*Math.pow(1-age/p.erp,.55)*p.weight;
    opening=Math.max(opening,value);
  }
  return opening;
}

export function filamentOffset(angle,strand,opening) {
  // Unequal broad folds, a wandering seam and occasional soft crossings.
  // Periodic around the whole ring, so no repeated segment-shaped pouches.
  const swell=.76+.22*Math.sin(3*angle+.7)+.13*Math.sin(7*angle-1.1);
  const drift=2.4*Math.sin(5*angle+.4)+1.2*Math.sin(9*angle+1.3);
  const shapes=[-9*swell+2.8*Math.sin(4*angle+.3),
    3.8*Math.sin(3*angle+1.8)+1.5*Math.sin(8*angle),
    8*swell+3.2*Math.sin(6*angle+2.1)];
  return (strand-1)*.3+opening*(shapes[strand]+drift);
}
