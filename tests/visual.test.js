import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createRenderer } from '../src/visuals/renderer.js';
import { createWeaveHistory, sampleWeave, pathPassages } from '../src/visuals/weave.js';
import { Engine } from '../src/engine/index.js';
import { circulationWorld } from '../src/worlds/circulation.js';
import { conductionWorld } from '../src/worlds/conduction.js';
import { dualityWorld } from '../src/worlds/duality.js';

const require = createRequire(import.meta.url);
const canvasModule = process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES
  ? `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas`
  : '@napi-rs/canvas';
const { createCanvas } = require(canvasModule);

function readFixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/v1/${name}.json`, import.meta.url)));
}

const world = readFixture('ring');
const protocolB = readFixture('B.presentation');
const protocolC = readFixture('C.presentation');
const width = 420;
const height = 284;
const dpr = 2;

// Test-only presentation adapter. Production receives snapshots from Engine.readAt.
function fixtureSnapshot(events, tMs, runId = events[0]?.runId ?? 'rest') {
  const nodes = Object.fromEntries(world.nodes.map((node) => [node.id, {
    ...node, lastActivationMs: null, refractoryUntilMs: null, recovery: 1, excitable: true,
  }]));
  const links = Object.fromEntries(world.links.map((link) => [link.id, { ...link, generation: 0 }]));
  const transits = new Map();
  for (const event of events) {
    if (event.tMs > tMs) break;
    if (event.type === 'activation') {
      const node = nodes[event.nodeId];
      node.lastActivationMs = event.tMs;
      node.refractoryUntilMs = event.refractoryUntilMs;
      node.excitable = tMs >= node.refractoryUntilMs;
      node.recovery = Math.max(0, Math.min(1, (tMs - node.refractoryUntilMs) / node.recoveryTailMs));
    }
    if (event.type === 'link_changed') {
      links[event.linkId].enabled = event.value;
      links[event.linkId].generation = event.generation;
    }
    if (event.type === 'conduction_launched') transits.set(event.transitId, event);
    if (event.type === 'conduction_arrived' || event.type === 'conduction_canceled') transits.delete(event.transitId);
    if (event.type === 'conduction_collision') {
      for (const transitId of event.transitIds) transits.delete(transitId);
    }
  }
  return { runId, worldId: world.worldId, tMs, nodes, links, activeTransits: [...transits.values()] };
}

function setup(reducedMotion = false, cssWidth = width, cssHeight = height, topology = world) {
  const image = createCanvas(cssWidth * dpr, cssHeight * dpr);
  const canvas = {
    get width() { return image.width; },
    set width(value) { image.width = value; },
    get height() { return image.height; },
    set height(value) { image.height = value; },
    getContext: (type, options) => image.getContext(type, options),
    getBoundingClientRect: () => ({ width: cssWidth, height: cssHeight }),
    ownerDocument: { createElement: () => createCanvas(1, 1), defaultView: { devicePixelRatio: dpr } },
  };
  const renderer = createRenderer(canvas, topology, { reducedMotion });
  return { renderer, image };
}

function frame(events, simMs, motion = false) {
  const { renderer, image } = setup(motion);
  renderer.render(fixtureSnapshot(events, simMs), events);
  return image;
}

function ringPoint(step) {
  const theta = step * Math.PI / 4 - Math.PI / 2;
  const radius = height * 0.33;
  return { x: width / 2 + radius * Math.cos(theta), y: height / 2 + radius * Math.sin(theta) };
}

function brightness(image, x, y, spread = 1) {
  const { data } = image.getContext('2d').getImageData(
    Math.round(x * dpr) - spread, Math.round(y * dpr) - spread, spread * 2 + 1, spread * 2 + 1,
  );
  let brightest = 0;
  for (let i = 0; i < data.length; i += 4) {
    brightest = Math.max(brightest, data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722);
  }
  return brightest;
}

const at = (image, point, spread) => brightness(image, point.x, point.y, spread);

const { renderer, image: rest } = setup();
renderer.render(fixtureSnapshot([], 0));
const restBytes = rest.toBuffer('image/png');
const r0 = renderer.nodePosition('R0');
assert.deepEqual(r0, { x: width / 2, y: height * 0.17 });
assert.equal(renderer.hitTest(r0.x + 21, r0.y), 'R0');
assert.equal(renderer.hitTest(r0.x + 22.1, r0.y), null);
assert.equal(renderer.hitTest(width / 2, height / 2), null);
assert.ok(brightness(rest, width / 2, height / 2) < 24);
renderer.render(fixtureSnapshot([], 500));
assert.ok(rest.toBuffer('image/png').equals(restBytes), 'rest has no autonomous motion');

const directionQuarter = frame(protocolB.events, 15);
const directionHalf = frame(protocolB.events, 30);
assert.ok(at(directionQuarter, ringPoint(0.25)) > 210);
assert.ok(at(directionQuarter, ringPoint(7.75)) > 210);
assert.ok(at(directionHalf, ringPoint(0.5)) > 210);
assert.ok(at(directionHalf, ringPoint(7.5)) > 210);
assert.ok(at(directionQuarter, ringPoint(0.5)) < 170);
assert.ok(at(directionQuarter, ringPoint(7.5)) < 170);

const doubleCapture = frame(protocolB.events, 240);
assert.ok(at(doubleCapture, ringPoint(0)) > 235);
assert.ok(at(doubleCapture, ringPoint(4)) > 235);
const block = frame(protocolB.events, 300);
const blockReduced = frame(protocolB.events, 300, true);
const refractory = ringPoint(1);
assert.ok(at(blockReduced, refractory) < 150);
const blockArc = { x: refractory.x - 7, y: refractory.y - 4 };
assert.ok(at(blockReduced, blockArc, 3) > 165);
assert.ok(at(block, ringPoint(.94), 6) > at(frame(protocolB.events, 380), ringPoint(.94), 6),
  'refractory block lights the incoming filaments before fading');
const partiallyRecovered = frame(protocolB.events, 420);
const fullyRecovered = frame(protocolB.events, 480);
assert.ok(at(partiallyRecovered, refractory) > at(blockReduced, refractory));
assert.ok(at(fullyRecovered, refractory) > at(partiallyRecovered, refractory));
const returnWave = frame(protocolB.events, 450);
assert.ok(at(returnWave, ringPoint(4.5)) > 210);
assert.ok(at(returnWave, ringPoint(3.5)) < 150);
const returnReduced = frame(protocolB.events, 450, true);
assert.ok(at(returnReduced, ringPoint(4.5)) < 205);
const earlierReduced = frame(protocolB.events, 445, true);
for (const step of [4.25, 4.5, 4.75]) {
  assert.equal(at(earlierReduced, ringPoint(step)), at(returnReduced, ringPoint(step)),
    'active link is spatially stationary in reduced motion');
}

const beforeCut = frame(protocolC.events, 990);
const cut = frame(protocolC.events, 1000);
const restored = frame(protocolC.events, 1500);
assert.ok(at(beforeCut, ringPoint(4.5)) > 95);
assert.ok(at(cut, ringPoint(4.5)) < 35);
assert.ok(at(frame(protocolC.events, 1000, true), ringPoint(4.5)) < 35);
assert.ok(at(restored, ringPoint(4.5)) > 95);

renderer.markGesture('R0', 'S1', 12, 'rest');
renderer.render(fixtureSnapshot([], 0));
const pending = setup().image;
pending.getContext('2d').drawImage(rest, 0, 0);
assert.ok(!rest.toBuffer('image/png').equals(restBytes));
renderer.render(fixtureSnapshot([], 12));
assert.ok(rest.toBuffer('image/png').equals(restBytes));
renderer.markGesture('R0', 'S1', 16, 'old');
renderer.render(fixtureSnapshot([], 0, 'new'), protocolB.events);
assert.ok(rest.toBuffer('image/png').equals(restBytes), 'reset fences stale gestures and events');

const { renderer: narrow, image: narrowImage } = setup(false, 360, 330);
narrow.render(fixtureSnapshot([], 0));
assert.equal(narrowImage.width, 720);
assert.equal(narrow.hitTest(180, 165 - 108.9), 'R0');
narrow.resize(360, 330, 4);
assert.equal(narrowImage.width, 720);
narrow.resize(500, 400, 1);
assert.equal(narrowImage.width, 500);
assert.equal(narrow.hitTest(250, 68), 'R0');

const collisionLaunches = [
  { fromNodeId: 'R0', toNodeId: 'R1', transitId: 't1' },
  { fromNodeId: 'R1', toNodeId: 'R0', transitId: 't2' },
].map((transit) => ({
  ...transit, type: 'conduction_launched', linkId: 'L0', departureMs: 0, arrivalMs: 60,
  tMs: 0, runId: 'synthetic-collision',
}));
const collisionEvents = [...collisionLaunches, {
  type: 'conduction_collision', linkId: 'L0', position: 0.5, transitIds: ['t1', 't2'],
  tMs: 30, runId: 'synthetic-collision',
}];
const collisionApproach = frame(collisionEvents, 24);
const collision = frame(collisionEvents, 30);
const collisionPoint = ringPoint(0.5);
assert.ok(at(collisionApproach, ringPoint(0.4)) > 210 && at(collisionApproach, ringPoint(0.6)) > 210);
assert.ok(at(collision, collisionPoint, 5) > 160, 'collision lights the strands at the meeting point');
const fadedCollision = frame(collisionEvents, 110);
assert.ok(at(collision, collisionPoint, 5) > at(fadedCollision, collisionPoint, 5));
assert.deepEqual(fixtureSnapshot(collisionEvents, 30).activeTransits, []);

// Run the production engine ahead of each cursor and compare its native Canvas frame
// with the independent contract 1.0.0 reference interpretation.
for (const { name, through, bookmarks } of [
  { name: 'B', through: 1200, bookmarks: [[30, directionHalf], [240, doubleCapture], [300, block], [450, returnWave]] },
  { name: 'C', through: 2000, bookmarks: [[990, beforeCut], [1000, cut], [1500, restored]] },
]) {
  const engine = new Engine();
  const commands = readFixture(`${name}.commands`);
  engine.reset(circulationWorld, commands[0].runId);
  for (const command of commands) engine.enqueue(command);
  const result = engine.advanceTo(through);
  const { renderer: actualRenderer, image: actualImage } = setup(false, width, height, circulationWorld);
  for (const [simMs, fixtureImage] of bookmarks) {
    actualRenderer.render(engine.readAt(simMs), result);
    assert.ok(actualImage.toBuffer('image/png').equals(fixtureImage.toBuffer('image/png')),
      `Protocol ${name} actual engine frame matches fixture at ${simMs} ms`);
  }
}

const center = { x: width / 2, y: height / 2 };
const place = (x, y) => ({ x: center.x + x * height * 0.33, y: center.y + y * height * 0.33 });
const radial = (step, radius) => {
  const point = ringPoint(step);
  return { x: center.x + (point.x - center.x) * radius, y: center.y + (point.y - center.y) * radius };
};
const crossRing = (step) => renderer.crossedLinks(radial(step, 0.77), radial(step, 1.20));
assert.deepEqual(crossRing(0.5), ['L0'], 'a radial swipe crosses the arc at a sampled vertex');
assert.deepEqual(crossRing(0.4), ['L0'], 'a radial swipe crosses between sampled vertices');
assert.deepEqual(crossRing(0.12), [], 'the approach to a node is reserved for stimulation');
assert.deepEqual(renderer.crossedLinks(radial(0.5, 1.2), radial(4.5, 1.2)), ['L0', 'L4']);
assert.deepEqual(renderer.crossedLinks(radial(4.5, 1.2), radial(0.5, 1.2)), ['L4', 'L0']);
assert.deepEqual(renderer.crossedLinks(radial(0.5, 0.8), radial(0.5, 1)), [], 'ending on a path is contact');
assert.deepEqual(renderer.crossedLinks(radial(0.5, 1), radial(0.5, 1.2)), [], 'starting on a path is contact');
assert.deepEqual(renderer.crossedLinks(radial(0.5, 1), radial(0.5, 1.2), radial(0.5, 0.8)), ['L0'],
  'a crossing split at a shared sample is still detected');
assert.deepEqual(renderer.crossedLinks(radial(0.5, 1), radial(0.7, 1.2), radial(0.5, 1.2)), [],
  'a swipe that turns back at a shared sample is a touch');
assert.deepEqual(renderer.crossedLinks(radial(0.12, 1), radial(0.12, 1.2), radial(0.12, 0.8)), [],
  'a split crossing still observes the node clearance');
assert.deepEqual(renderer.crossedLinks(radial(0.5, 1.01), radial(0.5, 1.2)), [], 'near misses do not cut');
assert.deepEqual(renderer.crossedLinks(center, center), [], 'a stationary contact is not a swipe');
const tangent = ringPoint(0.5);
const tangentAngle = Math.PI / 8;
const tangentStart = { x: tangent.x - 35 * Math.cos(tangentAngle), y: tangent.y - 35 * Math.sin(tangentAngle) };
const tangentEnd = { x: tangent.x + 35 * Math.cos(tangentAngle), y: tangent.y + 35 * Math.sin(tangentAngle) };
assert.deepEqual(renderer.crossedLinks(tangentStart, tangentEnd), [], 'grazing a path is contact');

function scene(topology, commands = []) {
  const engine = new Engine();
  const initial = engine.reset(topology, topology.worldId);
  for (const command of commands) engine.enqueue({ ...command, runId: initial.runId });
  const events = engine.advanceTo(650);
  function renderAt(tMs, reducedMotion = false, cssWidth = width, cssHeight = height) {
    const { renderer, image } = setup(reducedMotion, cssWidth, cssHeight, topology);
    renderer.render(tMs === null ? initial : engine.readAt(tMs), tMs === null ? [] : events);
    return { renderer, image };
  }
  return { renderAt };
}

const conduction = scene(conductionWorld, [
  { commandId: 'premature', type: 'stimulate', nodeId: 'A', tMs: 275 },
]);
const restedConduction = conduction.renderAt(null);
const branchedConduction = conduction.renderAt(139);
const capturedConduction = conduction.renderAt(150);
const delayedConduction = conduction.renderAt(390);
const conductionCut = scene(conductionWorld, [
  { commandId: 'cut-leaf', type: 'setLinkEnabled', linkId: 'HV2', enabled: false, tMs: 145 },
]).renderAt(145);
const conductionBranch = restedConduction.renderer.nodePosition('H');
assert.ok(conductionBranch.y > restedConduction.renderer.nodePosition('N').y);
assert.ok(conductionBranch.x > restedConduction.renderer.nodePosition('V1').x);
assert.ok(conductionBranch.x < restedConduction.renderer.nodePosition('V2').x);
assert.deepEqual(restedConduction.renderer.crossedLinks(place(-1.2, 0.67), place(1.2, 0.67)), ['HV1', 'HV2']);
assert.deepEqual(restedConduction.renderer.crossedLinks(place(-1.2, 0.08), place(1.2, 0.08)), ['NH']);
assert.deepEqual(conductionCut.renderer.crossedLinks(place(-1.2, 0.67), place(1.2, 0.67)), ['HV1', 'HV2']);
assert.ok(at(branchedConduction.image, place(-0.31, 0.71), 19) > 210, 'V1 head follows the left branch');
assert.ok(at(branchedConduction.image, place(0.24, 0.53), 17) > 210, 'V2 head follows the right branch');
assert.ok(at(capturedConduction.image, restedConduction.renderer.nodePosition('V1')) > 228);
assert.ok(at(delayedConduction.image, place(0.12, 0.10), 21) > 210, 'long nodal transit is still on its curve');
assert.ok(at(conductionCut.image, place(0.38, 0.65), 3) < 35, 'a cut puts a visible gap in the curved path');

const duality = scene(dualityWorld);
const restedDuality = duality.renderAt(null);
const warmDuality = duality.renderAt(30);
const coolDuality = duality.renderAt(207);
const reducedDuality = duality.renderAt(30, true);
const { renderer: dualityRenderer } = restedDuality;
assert.ok(dualityRenderer.nodePosition('A').x < center.x);
assert.ok(dualityRenderer.nodePosition('B').x > center.x);
assert.deepEqual(dualityRenderer.crossedLinks(place(0.07, -0.9), place(0.07, 0.9)), ['BB1', 'AA2']);
assert.ok(at(restedDuality.image, place(0, 0), 6) < 30, 'the two voices leave open space between them');
assert.ok(at(warmDuality.image, place(-0.76, 0.18), 32) > 218, 'the warm component has a traveling head in its phrase');
assert.ok(at(coolDuality.image, place(0.18, -0.24), 23) > 210, 'the cool component has a traveling head in its phrase');
assert.ok(at(reducedDuality.image, place(-0.76, 0.18), 32) < 190, 'the traveling head becomes a stationary cue');

for (const topology of [conduction, duality]) {
  const { renderer } = topology.renderAt(null, false, 360, 330);
  const nodeIds = topology === conduction ? ['S', 'A', 'N', 'H', 'V1', 'V2'] : ['A', 'A1', 'A2', 'B', 'B1', 'B2'];
  for (const id of nodeIds) {
    const position = renderer.nodePosition(id);
    assert.equal(renderer.hitTest(position.x, position.y), id);
    assert.ok(position.x > 22 && position.x < 338 && position.y > 22 && position.y < 308);
  }
}

function grayscale(source) {
  const image = createCanvas(source.width, source.height);
  const ctx = image.getContext('2d');
  ctx.drawImage(source, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const gray = pixels.data[i] * 0.2126 + pixels.data[i + 1] * 0.7152 + pixels.data[i + 2] * 0.0722;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
  }
  ctx.putImageData(pixels, 0, 0);
  return image;
}

function writeSheet(path, title, source, panels) {
  const cellWidth = width + 16;
  const cellHeight = height + 56;
  const sheet = createCanvas(3 * cellWidth, Math.ceil(panels.length / 3) * cellHeight + 64);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#080C13';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#E3DED5';
  ctx.font = '23px sans-serif';
  ctx.fillText(title, 21, 34);
  ctx.fillStyle = '#9CA9B8';
  ctx.font = '11px monospace';
  ctx.fillText(`CONTRACT 1.0.0     /     ${source}     /     420 × 284 CSS PX     /     DPR 2`, 22, 54);
  panels.forEach(([label, caption, panel], index) => {
    const x = (index % 3) * cellWidth + 8;
    const y = Math.floor(index / 3) * cellHeight + 64;
    ctx.drawImage(panel, x, y, width, height);
    ctx.strokeStyle = '#24313F';
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
    ctx.fillStyle = '#C8A878';
    ctx.font = '11px monospace';
    ctx.fillText(label, x + 12, y + height + 18);
    ctx.fillStyle = '#C0CAD4';
    ctx.font = '13px sans-serif';
    ctx.fillText(caption, x + 12, y + height + 38);
  });
  writeFileSync(path, sheet.toBuffer('image/png'));
}

if (process.argv[2]) {
  writeSheet(process.argv[2], 'Counterpoint · Circulation renderer study', 'TEST FIXTURES', [
    ['REST', 'No stimuli', rest],
    ['B / 240 MS', 'Two capture blooms', doubleCapture],
    ['B / 300 MS', 'R7 capture · R1 block', block],
    ['B / 450 MS', 'Reverse head midway from R5 to R4', returnWave],
    ['INPUT PENDING', 'Neutral dotted outline at R0', pending],
    ['COLLISION / 24 MS', 'Two approaching heads · synthetic', collisionApproach],
    ['COLLISION / 30 MS', 'Dissolution at encounter · synthetic', collision],
    ['C / 1000 MS', 'L4 interrupted · L3 still active', cut],
    ['GRAYSCALE / B / 300 MS', 'Capture ring and arrival-side block arcs', grayscale(block)],
    ['REDUCED MOTION / B / 300 MS', 'Stationary cue and block arcs', blockReduced],
    ['REDUCED MOTION / B / 450 MS', 'Stationary cue on active link', returnReduced],
    ['REDUCED MOTION / C / 1000 MS', 'Physical interruption persists', frame(protocolC.events, 1000, true)],
  ]);
}
if (process.argv[3]) {
  writeSheet(process.argv[3], 'Counterpoint · World geometry study', 'ENGINE SNAPSHOTS AND RING FIXTURES', [
    ['CIRCULATION / REST', 'Eight nodes around an open center', rest],
    ['CONDUCTION / REST', 'One upper source descends to a warm pair', restedConduction.image],
    ['DUALITY / REST', 'Two independent fans with separated paths', restedDuality.image],
    ['CIRCULATION / 450 MS', 'Circulating head from R5 toward R4', returnWave],
    ['CONDUCTION / 139 MS', 'Two traveling heads below the His analogue', branchedConduction.image],
    ['DUALITY / 30 MS', 'Warm voice in flight before the cool onset', warmDuality.image],
    ['CONDUCTION / 390 MS', 'Long nodal transit after a premature impulse', delayedConduction.image],
    ['CONDUCTION / 145 MS', 'V2 branch cut during transit', conductionCut.image],
    ['DUALITY / 207 MS', 'Cool voice in flight after its phase offset', coolDuality.image],
  ]);
}
console.log('Visual checks passed for all worlds with engine snapshots, contract fixtures and native Canvas 2D.');

// Each fork leg uses its own transit timing and only its own launch history.
{
  const engine = new Engine();
  engine.reset(conductionWorld, 'fork-weave');
  const events = engine.advanceTo(200);
  const history = createWeaveHistory()(events, 'fork-weave');
  const launch = events.find(event => event.type === 'conduction_launched' && event.linkId === 'HV1');
  const time = launch.departureMs + 17;
  const atBranch = (id, field = history) =>
    sampleWeave(pathPassages(field, [], id, time, 260, 0), 'H', .5, time, 260).opening;
  assert.ok(atBranch('HV1') > 0, 'the faster leg opens behind its halfway point');
  assert.equal(atBranch('HV2'), 0, 'the slower leg remains gathered ahead of its wave');
  const missingBranch = createWeaveHistory()(events.filter(event => event.linkId !== 'HV1'), 'fork-weave');
  assert.equal(atBranch('HV1', missingBranch), 0, 'a junction capture alone cannot open an idle leg');

  const snapshot = engine.readAt(190);
  const { renderer, image } = setup(false, width, height, conductionWorld);
  const node = renderer.nodePosition('H');
  const cleft = { x: node.x + 1, y: node.y + 16 };
  const distalArm = place(-.31, .71);
  const noWake = { ...snapshot, activeTransits: [] };
  renderer.render(noWake);
  assert.ok(at(image, cleft) > 65, 'the joined inner strands round the open fork');
  const distalBrightness = at(image, distalArm);
  const openFork = image.toBuffer('image/png');
  renderer.render({ ...noWake, nodes: { ...noWake.nodes, H: { ...snapshot.nodes.H, erpMs: 10 } } });
  assert.ok(image.toBuffer('image/png').equals(openFork), 'the fork uses the recorded refractory deadline');
  renderer.render({ ...noWake, nodes: { ...noWake.nodes, H: { ...snapshot.nodes.H, refractoryUntilMs: 189 } } });
  assert.ok(at(image, cleft) < 30, 'the cleft gathers once the actual refractory deadline passes');
  assert.equal(at(image, distalArm), distalBrightness, 'the shared opening stays near the fork');

  const blocked = { type: 'activation_blocked', eventId: 'block', cause: 'refractory', causeIds: [],
    runId: snapshot.runId, nodeId: 'H', incomingLinkIds: ['NH'], tMs: 189 };
  renderer.render(noWake, [{ ...blocked, tMs: 191 }]);
  assert.ok(image.toBuffer('image/png').equals(openFork), 'a future block leaves the presented fork unchanged');
  const stem = { x: node.x, y: node.y - 10 };
  const stemBrightness = at(image, stem, 6);
  renderer.render(noWake, [blocked]);
  assert.ok(at(image, stem, 6) > stemBrightness + 25, 'a blocked arrival lights the entering strands');
  assert.ok(at(image, cleft) > 65, 'a block leaves the fork on the earlier capture recovery');
}
