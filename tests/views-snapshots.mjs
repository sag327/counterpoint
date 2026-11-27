// Renders docs/runs/views-01-*.png from real engine runs. Usage: node tests/views-snapshots.mjs [outDir]
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createEngine } from '../src/engine/index.js';
import { createLadder } from '../src/visuals/ladder.js';
import { createStaves } from '../src/visuals/staves.js';
import { createMap } from '../src/visuals/map.js';
import { createRenderer } from '../src/visuals/renderer.js';
import {
  ECHO_S2, chainWorld, echoStaves, echoTiers, ostinatoWorld, runEcho, runLesionRing, runOstinato,
} from './views-scenes.js';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
const out = process.argv[2] ?? fileURLToPath(new URL('../docs/runs/', import.meta.url));
const DPR = 2;
const save = (name, canvas) => writeFileSync(`${out}/views-01-${name}.png`, canvas.toBuffer('image/png'));
function sheet(w, h, fn) {
  const canvas = createCanvas(w * DPR, h * DPR);
  fn(canvas.getContext('2d'), w, h);
  return canvas;
}

const echo = runEcho();
const ladder = createLadder({ tiers: echoTiers });
save('ladder', sheet(1200, 620, (ctx, w, h) => ladder.draw(ctx, { events: echo, presentedMs: 5600, windowMs: 3000, width: w, height: h, dpr: DPR,
  intervals: [{ fromEventId: echo.find((e) => e.type === 'activation' && e.nodeId === 'CSp' && e.tMs > 6100).eventId,
    toEventId: echo.find((e) => e.type === 'activation' && e.nodeId === 'CSp' && e.tMs > 6400).eventId }] })));

const staves = createStaves({ staves: echoStaves });
const cs = echo.filter((e) => e.type === 'activation' && e.nodeId === 'CSp' && e.tMs > 6000).map((e) => e.tMs);
staves.setCalipers(cs[0], cs[1]); staves.setReference(cs[1] - cs[0]);
save('staves', sheet(1200, 640, (ctx, w, h) => staves.draw(ctx, { events: echo, presentedMs: 6700, width: w, height: h, dpr: DPR, showSyntheticLabel: true })));

const ost = ostinatoWorld(); const oev = runOstinato();
const map = createMap({ world: ost, referenceNodeId: 'R0' });
map.update(oev, 2900);
save('map', sheet(1200, 700, (ctx, w, h) => {
  ctx.scale(DPR, DPR); ctx.fillStyle = '#080C13'; ctx.fillRect(0, 0, w, h);
  const cx = 400; const cy = 330; const R = 250; const pos = {};
  for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5; pos[`R${i}`] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) }; }
  const b = pos.R0;
  [['N1', 200, -20], ['N2', 330, -5], ['N3', 460, 25], ['H', 590, 70], ['V', 720, 130]].forEach(([id, dx, dy]) => { pos[id] = { x: b.x + dx, y: b.y + dy }; });
  map.draw(ctx, { nodePoint: (id) => pos[id], width: w, height: h, legend: { x: w - 260, y: 50, w: 200 }, labels: true, nodeRadius: 4.2 });
}));

// Network marks through the real renderer: a lesion forming on the production ring, and the concealed chain.
function rendered(world, engine, events, tMs, size = 420) {
  const image = createCanvas(size * DPR, size * DPR);
  const canvas = { get width() { return image.width; }, set width(v) { image.width = v; }, get height() { return image.height; },
    set height(v) { image.height = v; }, getContext: (t, o) => image.getContext(t, o), getBoundingClientRect: () => ({ width: size, height: size }),
    ownerDocument: { createElement: () => createCanvas(1, 1), defaultView: { devicePixelRatio: DPR } } };
  createRenderer(canvas, world).render(engine.readAt(tMs), events, tMs);
  return image;
}
const lesion = runLesionRing();
const le = createEngine({ processingBudget: 1e6 }); le.reset(lesion.world, 'l');
for (const c of [{ commandId: 'S1', type: 'stimulate', nodeId: 'R0', tMs: 0 }, { commandId: 'S2', type: 'stimulate', nodeId: 'R0', tMs: 240 },
  { commandId: 'abl', type: 'ablate', target: 'L3', durationMs: 2000, completeness: 1, tMs: 1000 }, { commandId: 'probe', type: 'stimulate', nodeId: 'R3', tMs: 6000 }]) le.enqueue({ runId: 'l', ...c });
const lev = le.advanceTo(9000);
const chain = chainWorld(); const ce = createEngine({ processingBudget: 1e6 }); ce.reset(chain, 'c');
ce.enqueue({ commandId: 'p', runId: 'c', type: 'stimulateTrain', nodeId: 'A', startMs: 0, cycleMs: 300, count: 8, label: 'pace', tMs: 0 });
const cev = ce.advanceTo(3000);
const pen = cev.filter((e) => e.type === 'conduction_launched' && e.linkId === 'N23')[2];
const frames = [rendered(lesion.world, le, lev, 2200), rendered(lesion.world, le, lev, 6420), rendered(chain, ce, cev, (pen.departureMs + pen.arrivalMs) / 2)];
save('network-marks', sheet(1260, 420, (ctx) => frames.forEach((img, i) => ctx.drawImage(img, i * 420 * DPR, 0))));
console.log('wrote snapshots to', out, 'premature at', ECHO_S2);
