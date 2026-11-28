// Execute the bundled script against deterministic browser API stand-ins.
// Real browser behavior, timing and resource checks belong in browser_smoke.py.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const artifact = readFileSync(new URL("../dist/counterpoint.html", import.meta.url), "utf8");
assert.doesNotMatch(artifact, /id="(?:palette|voicing)(?:-control)?"/);
const script = artifact.match(/<script>([\s\S]*)<\/script>/)[1];
const errors = [];
const timers = new Map();
const elements = new Map();
const listeners = new Map();
const noOp = () => {};
const context2d = new Proxy({}, {
  get: (_, key) => key === "createRadialGradient" ? () => ({ addColorStop: noOp }) : noOp,
});
let now = 0;
let nextTimerId = 0;
let frame;
let audio;

class Element {
  children = [];
  dataset = {};
  style = {};
  attributes = new Map();
  listeners = new Map();
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  dispatch(type, event) { this.listeners.get(type)?.(event); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  focus() {}
  setPointerCapture() {}
  setAttribute(key, value) { this.attributes.set(key, value); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 585 }; }
  getContext() { return context2d; }
  classList = { add() {}, remove() {}, toggle() {} };
  querySelectorAll() { return this.children; }
  querySelector() { return null; }
  click() { return this.disabled ? undefined : this.onclick?.({ detail: 0 }); }
}

const document = {
  createElement: () => new Element(),
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  },
  addEventListener(type, handler) { listeners.set(type, handler); },
  defaultView: { devicePixelRatio: 1 },
};
const select = (id) => document.getElementById(id);
select("canvas").ownerDocument = document;
select("lab").hidden = true;
for (const world of ["conduction", "circulation"]) {
  const button = new Element();
  button.dataset.world = world;
  select("worlds").append(button);
}

const param = () => ({
  value: 0,
  cancelScheduledValues: noOp,
  setValueAtTime: noOp,
  linearRampToValueAtTime: noOp,
});

class AudioNode {
  gain = param();
  pan = param();
  threshold = param();
  knee = param();
  ratio = param();
  attack = param();
  release = param();
  connect(node) { return node; }
  disconnect() {}
  start(time) {
    this.startTime = time;
    if (this.buffer) audio.sources.add(this);
  }
  stop(time) {
    this.stopTime = time;
    audio.sources.add(this);
  }
}

class TestAudioContext {
  sampleRate = 24_000;
  destination = new AudioNode();
  sources = new Set();
  state = "suspended";
  anchorWallMs = 0;
  anchorAudioSec = 0;
  constructor() { audio = this; }
  get currentTime() {
    if (this.state !== "running") return this.anchorAudioSec;
    return this.anchorAudioSec + (now - this.anchorWallMs) / 1000;
  }
  async resume() {
    if (this.state === "running") return;
    this.anchorWallMs = now;
    this.state = "running";
    this.onstatechange?.();
  }
  async suspend() {
    this.anchorAudioSec = this.currentTime;
    this.state = "suspended";
    this.onstatechange?.();
  }
  createGain() { return new AudioNode(); }
  createBufferSource() { return new AudioNode(); }
  createConstantSource() { return new AudioNode(); }
  createStereoPanner() { return new AudioNode(); }
  createDynamicsCompressor() { return new AudioNode(); }
  createWaveShaper() { return new AudioNode(); }
  createConvolver() { return new AudioNode(); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      duration: length / sampleRate,
      getChannelData: (index) => data[index],
      copyToChannel: (samples, index) => data[index].set(samples),
    };
  }
  drain() {
    for (const source of this.sources) {
      const naturalEnd = source.startTime + (source.buffer?.duration ?? Infinity);
      if (Math.min(source.stopTime ?? Infinity, naturalEnd) <= this.currentTime) {
        this.sources.delete(source);
        source.onended?.();
      }
    }
  }
}

const sandbox = {
  AudioContext: TestAudioContext,
  Blob,
  URLSearchParams,
  URL,
  document,
  structuredClone,
  console: { error: (error) => errors.push(error.stack ?? String(error)), warn: (error) => errors.push(String(error)) },
  location: { hash: "", pathname: "/counterpoint.html", search: "" },
  history: { replaceState() {} },
  matchMedia: () => ({ matches: false, addEventListener: noOp }),
  localStorage: {
    value: JSON.stringify({ palette: "atmosphere", voicing: "open" }),
    getItem() { return this.value; },
    setItem(_key, value) { this.value = value; },
  },
  performance: { now: () => now },
  ResizeObserver: class { observe() {} },
  requestAnimationFrame(callback) { frame = callback; },
  setTimeout(callback, delay) {
    const id = ++nextTimerId;
    timers.set(id, { time: now + delay, callback });
    return id;
  },
  clearTimeout(id) { timers.delete(id); },
};
sandbox.window = sandbox;
runInNewContext(script, sandbox, { filename: "counterpoint.html" });
const cp = sandbox.counterpoint;
assert.equal(select("dilation").children.map(option => option.textContent).join(), "1,1/4,1/8,1/12");
select("dilation").onchange();
assert.deepEqual(JSON.parse(sandbox.localStorage.value), { dilation: 4, volume: 0.3, muted: false, pacingCycleMs: 600 });
const activations = () => cp.events.filter((event) => event.type === "activation");

function runFor(duration, framePeriod = 16) {
  const finish = now + duration;
  let nextFrame = now + framePeriod;
  for (;;) {
    const task = Array.from(timers).sort(([, a], [, b]) => a.time - b.time)[0];
    const wake = task?.[1].time ?? Infinity;
    if (Math.min(wake, nextFrame) > finish) break;
    if (wake <= nextFrame) {
      now = wake;
      timers.delete(task[0]);
      task[1].callback();
    } else {
      now = nextFrame;
      nextFrame += framePeriod;
      frame(now);
    }
    audio?.drain();
  }
  now = finish;
  audio?.drain();
}

function chooseWorld(world) {
  select("worlds").children.find((button) => button.dataset.world === world).click();
}

function pointer(type, point, pointerId = 1, isPrimary = true) {
  select("stage").dispatch(type, {
    pointerId, button: 0, isPrimary, clientX: point.x, clientY: point.y,
  });
}

assert.equal(cp.transport.status, "running");
assert.equal(select("sites").children.length, 6);
assert.equal(select("sites").children[0].textContent, "S");
assert.ok(select("sites").children.every(node => !node.disabled));
await new Promise(resolve => setImmediate(resolve));
await select("sound").click();
assert.equal(cp.mixer.diagnostics().muted, true);
await select("sound").click();
assert.equal(cp.mixer.diagnostics().muted, false);
runFor(735);
assert.equal(activations().map(e => e.nodeId).join(), "S,A,N,H,V1,V2");
assert.equal(cp.mixer.diagnostics().scheduled, 6);

select("premature").click();
runFor(2700);
const captures = activations();
assert.deepEqual(Array.from(captures, event => event.nodeId), [
  "S", "A", "N", "H", "V1", "V2",
  "A", "S", "N", "H", "V1", "V2",
]);
const [baselineNode, prematureNode] = captures.filter(event => event.nodeId === "N");
const [baselineAtrium, prematureAtrium] = captures.filter(event => event.nodeId === "A");
assert.ok(
  prematureNode.tMs - prematureAtrium.tMs > baselineNode.tMs - baselineAtrium.tMs,
  "the premature beat should take longer to conduct from A to N"
);

// Duality left the menu (creator decision 2026-11-27). The switch to Circulation
// below covers the world change, and its ring checks match notes to captures.
select("pause").click();
runFor(100);
chooseWorld("circulation");
assert.equal(cp.transport.status, "idle");
assert.equal(cp.events.length, 0);
assert.equal(select("sites").children.length, 8);
await select("pause").click();
const scheduledBeforeRing = cp.mixer.diagnostics().scheduled;
select("sites").children[0].click();
runFor(1100);
assert.equal(activations().length, 8);
assert.equal(cp.mixer.diagnostics().scheduled - scheduledBeforeRing, 8);
select("guide").click();
runFor(7500);
assert.equal(activations().filter((event) => event.nodeId === "R0" && event.tMs < 2000).length, 5);
assert.ok(cp.events.some((event) => event.type === "activation_blocked" && event.cause === "refractory" && event.nodeId === "R1"));
assert.ok(cp.events.some((event) => event.type === "conduction_launched" && event.delayParts?.entryMs > 0));

const run = cp.transport.runId;
select("pause").click();
runFor(200);
assert.equal(cp.transport.status, "paused");
const count = cp.events.length;
runFor(200);
assert.equal(cp.events.length, count);
await select("pause").click();
runFor(250);
assert.equal(cp.transport.runId, run);
assert.ok(cp.events.length > count);

await audio.suspend();
runFor(200);
assert.equal(cp.transport.status, "paused");
assert.equal(cp.transport.state().reason, "audio-interrupted");
await select("pause").click();
runFor(250);
assert.equal(cp.transport.status, "running");
assert.equal(cp.transport.runId, run);
assert.doesNotMatch(select("status").textContent, /resume when ready/i);

// A guide reset while Web Audio is suspended queues the guide until explicit resume.
await audio.suspend();
select("guide").click();
runFor(250);
assert.equal(cp.transport.status, "idle");
assert.equal(activations().length, 0);
await select("pause").click();
runFor(250);
assert.equal(cp.transport.status, "running");
assert.ok(activations().length > 0);

document.hidden = true;
listeners.get("visibilitychange")();
assert.equal(cp.transport.status, "paused");
document.hidden = false;
const firstResume = select("pause").click();
document.hidden = true;
listeners.get("visibilitychange")();
document.hidden = false;
listeners.get("visibilitychange")();
await firstResume;
assert.equal(cp.transport.status, "paused", "A hide/show during Web Audio Resume must keep the run paused");
await select("pause").click();
runFor(250);
// Connections can no longer be cut (creator decision 2026-11-27): a drag across
// the ring submits nothing, and there are no cut or restore buttons.
const ringCenter = { x: 640, y: 292.5 };
const dragAngle = 5 * Math.PI / 8;
const atRadius = radius => ({
  x: ringCenter.x + radius * Math.cos(dragAngle),
  y: ringCenter.y + radius * Math.sin(dragAngle),
});
const commandCount = cp.transport.commandLog().length;
pointer("pointerdown", atRadius(140));
pointer("pointermove", atRadius(230));
pointer("pointerup", atRadius(230));
runFor(100);
assert.equal(cp.transport.commandLog().length, commandCount, "a drag submits no command");
assert.equal(select("cuts").children.length, 0);

// Pacing shares the live run, persists length, and never starts just by editing.
select('reset').click();
assert.equal(cp.selectedSite, 'R0');
select('pacing-cycle').value = '360';
select('pacing-cycle').onchange();
assert.equal(cp.transport.state().pacing, null);
assert.equal(JSON.parse(sandbox.localStorage.value).pacingCycleMs, 360);
select('sites').children[3].onfocus();
select('pacing-toggle').click();
assert.equal(cp.transport.state().pacing.nodeId, 'R3');
assert.equal(select('pacing-toggle').textContent, 'Stop pacing');
const pacedRunId = cp.transport.runId;
runFor(3000);
select('pacing-minus').click();
assert.equal(cp.transport.state().pacing.cycleMs, 350);
assert.equal(cp.transport.runId, pacedRunId);
select('pacing-toggle').click();
const pacedCount = cp.transport.commandLog().length;
runFor(2000);
assert.equal(cp.transport.commandLog().length, pacedCount);
chooseWorld('conduction');
assert.equal(cp.selectedSite, 'A');
assert.equal(cp.transport.state().pacing, null);
select('pacing-toggle').click();
assert.equal(cp.transport.state().pacing.nodeId, 'A');
select('premature').click();
assert.equal(cp.transport.state().pacing, null, 'demonstrations cancel pacing');
chooseWorld('circulation');
select("guide").click();
const samples = [];
for (let elapsed = 60_000; elapsed <= 1_200_000; elapsed += 60_000) {
  runFor(60_000);
  const engine = cp.engine.diagnostics();
  const { recent, ...mixer } = cp.mixer.diagnostics();
  const sample = { elapsed, retention: cp.retention, engine, mixer, pendingTimers: timers.size };
  assert.equal(cp.transport.status, "running");
  assert.ok(engine.retainedBatches <= 4096, JSON.stringify(sample));
  assert.ok(cp.retention.retained <= 4096);
  assert.ok(engine.pendingItems <= 1);
  assert.ok(mixer.liveSources <= 40);
  assert.ok(mixer.cacheBuffers <= 48);
  assert.equal(mixer.duplicates, 0);
  assert.equal(timers.size, 1);
  samples.push(sample);
}
assert.ok(cp.retention.discardedEvents > 0);
assert.ok(cp.engine.diagnostics().retainedFromMs > 0);

for (let i = 0; i < 13; i += 1) {
  select("reset").click();
  assert.equal(cp.events.length, 0);
  assert.equal(cp.mixer.diagnostics().runId, cp.transport.runId);
  select("guide").click();
  runFor(17);
  assert.ok(cp.events.every((event) => event.runId === cp.transport.runId));
}
select("reset").click();
assert.equal(cp.events.length, 0);
runFor(1200);
assert.equal(cp.mixer.diagnostics().liveSources, 0);
const firstSite = select("sites").children[0];
const site = { x: parseFloat(firstSite.style.left), y: parseFloat(firstSite.style.top) };
pointer("pointerdown", site);
pointer("pointercancel", site);
pointer("pointerup", site);
assert.equal(cp.transport.commandLog().length, 0);
pointer("pointerdown", site);
pointer("pointerdown", atRadius(140), 2, false);
pointer("pointermove", atRadius(230), 2, false);
pointer("pointerup", atRadius(230), 2, false);
pointer("pointermove", { x: site.x + 3, y: site.y - 1 });
pointer("pointerup", site);
firstSite.onclick({ detail: 1 });
runFor(100);
assert.equal(cp.transport.commandLog().length, 1);
assert.equal(cp.transport.commandLog()[0].nodeId, "R0");
assert.equal(cp.transport.commandLog()[0].type, "stimulate");
assert.equal(errors.length, 0, errors.join("\n"));
console.log(JSON.stringify({
  artifactSha256: createHash("sha256").update(artifact).digest("hex"),
  environment: "Node VM with simulated clock, DOM, Canvas and Web Audio stand-ins",
  samples: [samples[0], samples[9], samples[19]],
  resetButtonInvocationsAfterSoak: 14,
  timersAfterReset: timers.size,
  errors,
}, null, 2));
