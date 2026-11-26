import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CHAMBER_VOICINGS, PALETTES, mapActivation } from "../src/music/index.js";
import { protectPeak, renderVoiceSamples, roomTaps } from "../src/music/synthesis.js";
import { conductionWorld } from "../src/worlds/conduction.js";
import { dualityWorld } from "../src/worlds/duality.js";
import { play, stimulus } from "./engine-scenes.js";

const sampleRate = 24000;
const wallStart = 0.15;
const fixture = JSON.parse(readFileSync(new URL("./fixtures/v1/C.presentation.json", import.meta.url)));
const args = process.argv.slice(2);
const useWorlds = args.includes("--worlds");
const exportDirectory = args.find((arg) => arg !== "--worlds");

function render(events, { voicing, palette, dilation, tailSec = 3.8 }) {
  const notes = events.map((event) => mapActivation(event, { voicing, palette })).filter(Boolean);
  const duration = Math.ceil(wallStart + notes.at(-1).tMs * dilation / 1000 + tailSec);
  const length = sampleRate * duration;
  const dry = [new Float32Array(length), new Float32Array(length)];
  const wet = [new Float32Array(length), new Float32Array(length)];

  for (const note of notes) {
    const onset = Math.round((wallStart + note.tMs * dilation / 1000) * sampleRate);
    const waveform = renderVoiceSamples(note, sampleRate);
    const angle = (note.pan + 1) * Math.PI / 4;
    const levels = [Math.cos(angle), Math.sin(angle)];
    for (let channel = 0; channel < 2; channel++) {
      for (let i = 0; i < waveform.length; i++) {
        const sample = waveform[i] * levels[channel] * note.gain;
        dry[channel][onset + i] += sample;
        wet[channel][onset + i] += sample * note.reverbSend;
      }
    }
  }

  for (let channel = 0; channel < 2; channel++) {
    for (const [delay, gain] of roomTaps(sampleRate, channel)) {
      for (let i = 0; i < length - delay; i++) {
        dry[channel][i + delay] += wet[channel][i] * gain;
      }
    }
    for (let i = 0; i < length; i++) dry[channel][i] = protectPeak(0.3 * dry[channel][i]);
  }
  return { channels: dry, lastOnset: wallStart + notes.at(-1).tMs * dilation / 1000 };
}

function measure(channels) {
  const metrics = [];
  for (let channel = 0; channel < 3; channel++) {
    // The third measurement averages the stereo channels for a mono fold-down.
    const signal = channels[channel] ?? channels[0].map((sample, index) => (sample + channels[1][index]) / 2);
    let peak = 0;
    let tail = 0;
    let dc = 0;
    let sumSquares = 0;
    let maxStep = 0;
    for (let i = 0; i < signal.length; i++) {
      const sample = signal[i];
      assert.ok(Number.isFinite(sample));
      peak = Math.max(peak, Math.abs(sample));
      if (i >= signal.length - sampleRate / 2) tail = Math.max(tail, Math.abs(sample));
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(sample - signal[i - 1]));
      dc += sample;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / signal.length);
    dc /= signal.length;
    assert.ok(peak >= 0.01 && peak < 0.76, `headroom: ${peak}`);
    assert.ok(Math.abs(dc) < 0.0001, `DC: ${dc}`);
    assert.ok(maxStep < 0.10, `unexpected sample step: ${maxStep}`);
    assert.ok(tail < 0.00001, `quiescent tail: ${tail}`);
    assert.ok(rms > 0.003, `signal RMS: ${rms}`);
    metrics.push({ peak, dc, rms, maxStep, tail });
  }
  return metrics;
}

function wav(channels) {
  const frames = channels[0].length;
  const bytes = Buffer.alloc(44 + frames * 4);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 4, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < 2; channel++) {
      bytes.writeInt16LE(Math.round(32767 * channels[channel][i]), 44 + 4 * i + 2 * channel);
    }
  }
  return bytes;
}

if (exportDirectory) mkdirSync(exportDirectory, { recursive: true });
const studies = [];
if (useWorlds) {
  for (const world of [conductionWorld, dualityWorld]) {
    const runId = `audition-${world.worldId}`;
    const commands = world.worldId === "conduction" ? [stimulus(runId, "premature", 275, "A")] : [];
    const { events } = play(world, runId, commands, [4500]);
    for (const palette of PALETTES) {
      studies.push({ events, worldId: world.worldId, palette, voicing: "balanced", dilation: 4, tailSec: 4.2,
        name: `${world.worldId}-${palette}` });
    }
  }
} else {
  for (const dilation of [1, 4, 8]) {
    for (const voicing of dilation === 4 ? CHAMBER_VOICINGS : ["balanced"]) {
      studies.push({ events: fixture.events, worldId: "circulation", palette: "chamber", voicing, dilation, name: `chamber-${voicing}` });
    }
  }
}

const results = [];
for (const study of studies) {
  const { events, worldId, palette, voicing, dilation, name } = study;
  const start = performance.now();
  const { channels, lastOnset } = render(events, study);
  const captures = events.filter((event) => event.type === "activation");
  assert.equal(lastOnset, wallStart + captures.at(-1).tMs * dilation / 1000);
  const metrics = measure(channels);
  results.push({ worldId, palette, voicing, dilation, captures: captures.length,
    seconds: channels[0].length / sampleRate, lastOnset, metrics, elapsedMs: Math.round(performance.now() - start) });
  if (exportDirectory && dilation === 4) {
    writeFileSync(join(exportDirectory, `${name}.wav`), wav(channels));
  }
}
console.log(JSON.stringify({ channelOrder: ["left", "right", "mono"], results }, null, 2));
