// Echo music: mapper v1.1 (presentation table, audible:false sites silent) and
// an offline render signal check on real engine runs of the Echo study.
import assert from 'node:assert/strict';
import test from 'node:test';
import { describeNodeMusic, mapActivation, musicTableFor } from '../src/music/index.js';
import { protectPeak, renderVoiceSamples } from '../src/music/synthesis.js';
import { simulate } from '../src/lab/protocols.js';
import { echoPresentation, echoWorld } from '../src/worlds/echo.js';
import { circulationWorld } from '../src/worlds/circulation.js';
import { conductionWorld } from '../src/worlds/conduction.js';

const SR = 24000;
const START = 0.15;
const table = musicTableFor(echoWorld, echoPresentation);
const findEcho = echoPresentation.protocols.find(p => p.id === 'find-echo');

function run(s2, untilMs = 7600) {
  return simulate(echoWorld, findEcho.commands(s2), untilMs, { runId: `echo-audio-${s2}` }).events;
}

// Dry render (no room): every sample comes from a note, so attacks can be traced.
function render(notes, dilation) {
  const last = notes.at(-1);
  const length = Math.ceil((START + last.tMs * dilation / 1000 + 2.5) * SR);
  const mono = new Float32Array(length);
  for (const note of notes) {
    const onset = Math.round((START + note.tMs * dilation / 1000) * SR);
    const wave = renderVoiceSamples(note, SR);
    for (let i = 0; i < wave.length; i++) mono[onset + i] += wave[i] * note.gain;
  }
  for (let i = 0; i < length; i++) mono[i] = protectPeak(0.3 * mono[i]);
  return mono;
}

test('Mapper v1.1: Echo uses the presentation table; nodal and sinus sites are silent; v1.0 worlds unchanged', () => {
  assert.equal(musicTableFor(circulationWorld), null);
  assert.equal(musicTableFor(conductionWorld, echoPresentation), null);
  for (const node of echoWorld.nodes) {
    if (node.audible === false) assert.equal(table[node.id], null, node.id);
    else assert.deepEqual([...table[node.id]], [...echoPresentation.music[node.id]]);
  }
  assert.equal(describeNodeMusic('echo', 'FP', { nodes: table }), null);
  assert.equal(describeNodeMusic('echo', 'V', { nodes: table }).pitchMidi, 50);
  // A table that tries to voice a silent site is overridden by audible:false.
  const loud = musicTableFor(echoWorld, { music: { ...echoPresentation.music, FP: [60, 'felt', 0] } });
  assert.equal(loud.FP, null);
  assert.throws(() => musicTableFor(echoWorld, { music: {} }), /Missing music assignment/);
  // v1.0 identities do not move.
  const event = { type: 'activation', worldId: 'circulation', nodeId: 'R2', runId: 'r', eventId: 'e1', tMs: 0, recoveryBefore: 1 };
  assert.equal(mapActivation(event).pitchHz, 440);
});

test('Echo offline render: one note per audible activation, onsets aligned, no attack without an activation', () => {
  for (const [s2, kind] of [[400, 'arpeggio'], [280, 'chord'], [250, 'echo']]) {
    const events = run(s2);
    const activations = events.filter(e => e.type === 'activation');
    const silent = activations.filter(e => table[e.nodeId] === null);
    const audible = activations.filter(e => table[e.nodeId] !== null);
    assert.ok(silent.length > 10, `${kind}: nodal sites fire`);
    const notes = events.map(e => mapActivation(e, { nodes: table })).filter(Boolean);
    assert.deepEqual(notes.map(n => n.eventId), audible.map(e => e.eventId), `${kind}: identities`);
    assert.deepEqual(notes.map(n => n.tMs), audible.map(e => e.tMs));

    for (const dilation of [1, 4]) {
      const mono = render(notes, dilation);
      const onsets = notes.map(n => (START + n.tMs * dilation / 1000) * SR);
      // Silence before the first note, exactly.
      const first = Math.round(onsets[0]);
      for (let i = 0; i < first; i++) assert.equal(mono[i], 0);
      let peak = 0;
      for (const sample of mono) {
        assert.ok(Number.isFinite(sample));
        peak = Math.max(peak, Math.abs(sample));
      }
      assert.ok(peak > 0.01 && peak < 0.76, `${kind}: headroom ${peak}`);
      // 10 ms max-abs envelope frames (longer than the lowest voice's period).
      // An attack is a frame at least 2x the previous 3 frames.
      const frame = SR / 100;
      const env = [];
      for (let k = 0; k * frame < mono.length; k++) {
        let m = 0;
        for (let i = k * frame; i < Math.min(mono.length, (k + 1) * frame); i++) m = Math.max(m, Math.abs(mono[i]));
        env.push(m);
      }
      const attacks = [];
      for (let k = 3; k < env.length; k++) {
        const before = Math.max(env[k - 1], env[k - 2], env[k - 3]);
        if (env[k] > 1e-3 && env[k] > 2 * before) attacks.push(k * frame);
      }
      const windows = notes.map((n, i) => [onsets[i] - frame, onsets[i] + n.attackSec * SR + frame]);
      for (const at of attacks) {
        assert.ok(windows.some(([a, b]) => at >= a && at <= b), `${kind} ${dilation}x: attack at ${(at / SR).toFixed(4)} s has no activation`);
      }
      // Every note that is not masked by louder ringing notes shows its own attack:
      // the envelope rises after its onset by a quarter of what the note alone adds.
      let checked = 0;
      notes.forEach((note, i) => {
        const wave = renderVoiceSamples(note, SR);
        let own = 0;
        for (const sample of wave) own = Math.max(own, Math.abs(0.3 * sample * note.gain));
        const k0 = Math.floor(onsets[i] / frame);
        const before = env[k0 - 1] ?? 0;
        let after = 0;
        for (let k = k0; k * frame <= windows[i][1] + frame; k++) after = Math.max(after, env[k] ?? 0);
        if (before > own) return;
        checked++;
        assert.ok(after - before > 0.25 * own, `${kind} ${dilation}x: no attack for ${note.eventId} at ${note.tMs} (${before.toFixed(4)} -> ${after.toFixed(4)}, own ${own.toFixed(4)})`);
      });
      // At the default 4x nearly every note stands clear; at 1x long releases overlap.
      const needed = dilation === 4 ? Math.ceil(0.7 * notes.length) : 5;
      assert.ok(checked >= needed, `${kind} ${dilation}x: only ${checked} of ${notes.length} notes unmasked`);
    }
  }
});
