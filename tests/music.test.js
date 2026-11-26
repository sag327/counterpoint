import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CHAMBER_VOICINGS, PALETTES, createAudioMixer, describeNodeMusic, mapActivation } from "../src/music/index.js";
import { conductionWorld } from "../src/worlds/conduction.js";
import { dualityWorld } from "../src/worlds/duality.js";
import { play, stimulus } from "./engine-scenes.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/v1/${name}.presentation.json`, import.meta.url))).events;
const fixtures = { A: 8, B: 25, C: 28 };
const noteKeys = ["runId", "eventId", "tMs", "pitchHz", "voice", "gain", "attackSec", "releaseSec", "brightness", "pan", "reverbSend"];

test("M01–M02 join all activation and intent identities, without blocked notes", () => {
  for (const [name, count] of Object.entries(fixtures)) {
    const events = fixture(name);
    const attacks = events.filter((event) => event.type === "activation");
    const intents = events.map((event) => mapActivation(event)).filter(Boolean);
    assert.equal(intents.length, count);
    assert.deepEqual(intents, events.map((event) => mapActivation(event)).filter(Boolean));
    assert.deepEqual(intents.map(({ runId, eventId, tMs }) => ({ runId, eventId, tMs })),
      attacks.map(({ runId, eventId, tMs }) => ({ runId, eventId, tMs })));
    assert.equal(new Set(intents.map(({ runId, eventId }) => `${runId}/${eventId}`)).size, count);
    for (const note of intents) {
      assert.deepEqual(Object.keys(note), noteKeys);
      assert.ok(note.pitchHz > 0 && note.gain > 0 && note.gain <= 1);
      assert.ok(note.attackSec > 0 && note.releaseSec > 0);
      assert.ok(note.brightness >= 0 && note.brightness <= 1);
      assert.ok(note.pan >= -1 && note.pan <= 1);
      assert.ok(note.reverbSend >= 0 && note.reverbSend <= 1);
    }
  }

  const events = fixture("B");
  for (const [tMs, nodes] of [[240, ["R0", "R4"]], [300, ["R7"]]]) {
    const sounded = events.filter((event) => event.tMs === tMs && mapActivation(event));
    assert.deepEqual(sounded.map((event) => event.nodeId), nodes);
  }
  const merged = events.find((event) => event.tMs === 240 && event.type === "activation" && event.nodeId === "R4");
  assert.equal(merged.incomingLinkIds.length, 2);
  const blocked = events.find((event) => event.tMs === 300 && event.type === "activation_blocked" && event.nodeId === "R1");
  assert.equal(blocked.remainingErpMs, 60);
  assert.equal(mapActivation(blocked), null);
});

test("M03 palette and pitch comparisons preserve provenance, with audible recovery floor", () => {
  const events = fixture("B");
  const original = structuredClone(events);
  const accepted = events.filter((event) => event.type === "activation");
  const noteMappings = PALETTES.map((palette) => accepted.map((event) => mapActivation(event, { palette })));
  for (const notes of noteMappings) {
    assert.deepEqual(notes.map((note) => note.tMs), accepted.map((event) => event.tMs));
    assert.deepEqual(notes.map((note) => note.eventId), accepted.map((event) => event.eventId));
  }
  assert.notDeepEqual(noteMappings[0], noteMappings[1]);
  assert.deepEqual(events, original);
  const withoutPitch = ({ pitchHz, ...intent }) => intent;
  for (const voicing of CHAMBER_VOICINGS) {
    assert.deepEqual(accepted.map((event) => withoutPitch(mapActivation(event, { voicing }))),
      noteMappings[0].map(withoutPitch));
    for (const event of accepted) {
      const identity = describeNodeMusic("circulation", event.nodeId, { voicing });
      const note = mapActivation(event, { voicing });
      assert.deepEqual([note.pitchHz, note.voice, note.pan], [identity.pitchHz, identity.voice, identity.pan]);
    }
  }
  const event = accepted[0];
  const rested = mapActivation({ ...event, recoveryBefore: 1 });
  const threshold = mapActivation({ ...event, recoveryBefore: 0 });
  assert.equal(threshold.pitchHz, rested.pitchHz);
  assert.ok(threshold.gain > 0 && threshold.gain < rested.gain);
  assert.ok(threshold.brightness < rested.brightness);
  assert.ok(threshold.releaseSec < rested.releaseSec);
  assert.equal(mapActivation(event, { nodes: { R0: null } }), null);
  assert.equal(describeNodeMusic("study", "R0", { nodes: { R0: null } }), null);
  const override = { nodes: { R0: [72, "glass", 0.5] }, voicing: "open" };
  assert.deepEqual(describeNodeMusic("study", "R0", override), {
    pitchMidi: 72, pitchHz: 440 * 2 ** (3 / 12), voice: "glass", pan: 0.5,
  });
  assert.throws(() => describeNodeMusic("study", "R0"), /Missing music assignment/);
});

test("M01–M03 Conduction and Duality map actual engine captures across palettes", () => {
  const scenarios = [
    {
      world: conductionWorld,
      commands: [stimulus("music-conduction", "premature", 260, "A")],
      pitches: { S: [62, "felt"], A: [69, "pluck"], N: [65, "glass"], H: [72, "pluck"], V1: [50, "bow"], V2: [57, "felt"] },
    },
    {
      world: dualityWorld,
      commands: [],
      pitches: { A: [62, "felt"], A1: [65, "pluck"], A2: [69, "glass"], B: [50, "bow"], B1: [55, "felt"], B2: [60, "glass"] },
    },
  ];

  for (const { world, commands, pitches } of scenarios) {
    const { engine, events } = play(world, `music-${world.worldId}`, commands, [3400]);
    const originalEvents = structuredClone(events);
    const originalState = engine.readAt(3400);
    const accepted = events.filter((event) => event.type === "activation");
    const provenance = ({ runId, eventId, tMs }) => ({ runId, eventId, tMs });
    assert.deepEqual(new Set(accepted.map((event) => event.nodeId)), new Set(world.nodes.map((node) => node.id)));
    if (world.worldId === "conduction") {
      assert.ok(events.some((event) => event.type === "activation_blocked" && event.nodeId === "N"));
    }

    for (const event of accepted) {
      const identity = describeNodeMusic(world.worldId, event.nodeId);
      assert.deepEqual([identity.pitchMidi, identity.voice], pitches[event.nodeId]);
      if (world.worldId === "duality") {
        assert.equal(Math.sign(identity.pan), event.nodeId.startsWith("A") ? -1 : 1);
      }
      for (const voicing of CHAMBER_VOICINGS) {
        assert.deepEqual(describeNodeMusic(world.worldId, event.nodeId, { voicing }), identity);
      }
    }

    const notes = PALETTES.map((palette) => events.map((event) => mapActivation(event, { palette })).filter(Boolean));
    for (const intents of notes) {
      assert.deepEqual(intents.map(provenance), accepted.map(provenance));
      for (const [index, intent] of intents.entries()) {
        const { pitchHz, voice, pan } = describeNodeMusic(world.worldId, accepted[index].nodeId);
        assert.deepEqual([intent.pitchHz, intent.voice, intent.pan], [pitchHz, voice, pan]);
        assert.ok(intent.gain > 0);
      }
    }
    const [chamber, atmosphere, minimalism] = notes.map((intents) => intents[0]);
    assert.ok(atmosphere.attackSec > chamber.attackSec && chamber.attackSec > minimalism.attackSec);
    assert.ok(atmosphere.releaseSec > chamber.releaseSec && chamber.releaseSec > minimalism.releaseSec);
    assert.ok(atmosphere.reverbSend > chamber.reverbSend && chamber.reverbSend > minimalism.reverbSend);
    assert.ok(atmosphere.brightness < chamber.brightness && chamber.brightness < minimalism.brightness);
    assert.deepEqual(events, originalEvents);
    assert.deepEqual(engine.readAt(3400), originalState);
  }
});

class Parameter {
  value = 0;
  operations = [];
  cancelScheduledValues(time) { this.operations.push(["cancel", time]); }
  setValueAtTime(value, time) { this.operations.push(["set", value, time]); }
  linearRampToValueAtTime(value, time) { this.operations.push(["ramp", value, time]); }
}

class Node {
  gain = new Parameter();
  pan = new Parameter();
  threshold = new Parameter();
  knee = new Parameter();
  ratio = new Parameter();
  attack = new Parameter();
  release = new Parameter();
  starts = [];
  stops = [];
  connections = [];
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections.length = 0; }
  start(when) { this.starts.push(when); }
  stop(when) { this.stops.push(when); }
}

class TestContext {
  currentTime = 0;
  sampleRate = 24000;
  destination = new Node();
  gains = [];
  sources = [];
  timers = [];
  createGain() { const node = new Node(); this.gains.push(node); return node; }
  createBufferSource() { const node = new Node(); this.sources.push(node); return node; }
  createConstantSource() { const node = new Node(); this.timers.push(node); return node; }
  createStereoPanner() { return new Node(); }
  createDynamicsCompressor() { return new Node(); }
  createWaveShaper() { return new Node(); }
  createConvolver() { return new Node(); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return {
      duration: length / sampleRate,
      getChannelData: (index) => data[index],
      copyToChannel: (samples, index) => data[index].set(samples),
    };
  }
  advance(time) {
    this.currentTime = time;
    for (const source of this.sources) {
      if (Math.min(source.starts[0] + source.buffer.duration, source.stops.at(-1) ?? Infinity) <= time) {
        source.onended?.();
      }
    }
    for (const timer of this.timers) {
      if (timer.stops.at(-1) <= time) timer.onended?.();
    }
  }
}

const activation = (eventId, runId = "study-B") => mapActivation({
  ...fixture("B").find((event) => event.type === "activation"),
  eventId: `e${eventId}`,
  runId,
});

test("exact timed starts, duplicate and old-run fencing, master ramps", () => {
  const context = new TestContext();
  const mixer = createAudioMixer(context);
  mixer.beginRun("study-B");
  assert.ok(mixer.schedule(activation(2), 0.010));
  assert.ok(mixer.schedule(activation(3), 0.050));
  assert.equal(mixer.schedule(activation(2), 0.010), false);
  assert.deepEqual(context.sources.map((source) => source.starts[0]), [0.010, 0.050]);
  assert.equal(mixer.diagnostics().activeVoices, 0);
  assert.equal(mixer.diagnostics().masterGain, 0.3);

  context.advance(0.02);
  assert.equal(mixer.diagnostics().activeVoices, 1);
  mixer.setMuted(true);
  context.advance(0.03);
  mixer.setVolume(0.5);
  context.advance(0.04);
  mixer.setMuted(false);
  const gain = context.gains[0].gain;
  const [cancel, hold, ramp] = gain.operations.slice(-3);
  assert.deepEqual(cancel, ["cancel", 0.04]);
  assert.equal(hold[0], "set");
  assert.equal(hold[2], 0.04);
  assert.ok(Math.abs(hold[1] - 0.15306122449) < 1e-10);
  assert.equal(mixer.diagnostics().masterGain, hold[1]);
  assert.deepEqual(ramp.slice(0, 2), ["ramp", 0.5]);
  assert.ok(Math.abs(ramp[2] - 0.075) < 1e-10);
  assert.equal(mixer.diagnostics().scheduled, 2);

  mixer.fence({ immediate: true });
  assert.deepEqual(context.sources.map((source) => source.stops.at(-1)), [0.04, 0.04]);
  assert.ok(context.sources.every((source) => source.connections.length === 0));
  mixer.beginRun("study-B");
  assert.equal(mixer.schedule(activation(3), 0.06), false);
  assert.equal(mixer.schedule(activation(4), 0.07), true);
  mixer.beginRun("new");
  assert.equal(context.sources.at(-1).stops.at(-1), 0.04);
  assert.equal(mixer.schedule(activation(5), 0.09), false);
  assert.ok(mixer.schedule(activation(2, "new"), 0.1));
  context.advance(5);
  assert.equal(mixer.diagnostics().liveSources, 0);
  assert.equal(mixer.diagnostics().activeVoices, 0);
  assert.equal(mixer.diagnostics().masterGain, 0.5);
  mixer.dispose();
});

test("pause preserves an onset at the exact boundary and fences future audio", () => {
  for (const [options, keepsBoundary] of [[{}, false], [{ preserveBoundary: true }, true], [{ immediate: true, preserveBoundary: true }, false]]) {
    const context = new TestContext();
    const mixer = createAudioMixer(context);
    mixer.beginRun("study-B");
    assert.ok(mixer.schedule(activation(2), 0.05));
    assert.ok(mixer.schedule(activation(3), 0.06));
    context.advance(0.05);
    mixer.fence(options);
    const [boundary, future] = context.sources;
    assert.equal(boundary.connections.length > 0, keepsBoundary);
    assert.equal(boundary.stops.at(-1), keepsBoundary ? 0.05 + 0.012 : 0.05);
    assert.equal(future.connections.length, 0);
    assert.equal(future.stops.at(-1), 0.05);
    context.advance(0.08);
    assert.equal(boundary.connections.length, 0);
  }
});

test("M10 retires oldest tails under dense input and keeps source count bounded", () => {
  const context = new TestContext();
  const mixer = createAudioMixer(context, { maxVoices: 6 });
  mixer.beginRun("study-B");
  const captured = activation(1);
  for (let i = 1; i <= 200; i++) {
    assert.equal(mixer.schedule({ ...captured, eventId: `e${i}` }, i * 0.0002), true);
  }
  assert.equal(mixer.diagnostics().scheduled, 200);
  assert.equal(mixer.diagnostics().peakVoices, 6);
  assert.ok(mixer.diagnostics().peakSources <= 14);
  assert.equal(mixer.diagnostics().stolen, 194);
  assert.ok(mixer.diagnostics().hardCuts > 0);
  assert.equal(mixer.diagnostics().cacheBuffers, 1);
  context.advance(5);
  assert.equal(mixer.diagnostics().liveSources, 0);
});
