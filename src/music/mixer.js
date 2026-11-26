import { protectPeak, renderVoiceSamples, roomTaps, ROOM_SEC } from "./synthesis.js";

const CONTROL_RAMP_SEC = 0.035;
const FENCE_RAMP_SEC = 0.012;
const STOLEN_RAMP_SEC = 0.008;
const CACHE_LIMIT = 48;
const JOURNAL_LIMIT = 128;
const RETIRING_LIMIT = 8;

function clampVolume(value) {
  if (!Number.isFinite(value)) throw new RangeError("Volume must be finite");
  return Math.max(0, Math.min(1, value));
}

function roomBuffer(context) {
  const buffer = context.createBuffer(2, Math.ceil(context.sampleRate * ROOM_SEC), context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (const [index, level] of roomTaps(context.sampleRate, channel)) samples[index] += level;
  }
  return buffer;
}

export function createAudioMixer(context, { volume = 0.30, maxVoices = 32 } = {}) {
  if (!Number.isInteger(maxVoices) || maxVoices < 1 || maxVoices > 64) {
    throw new RangeError("Voice limit must be an integer from 1 to 64");
  }
  let volumeLevel = clampVolume(volume);
  let muted = false;
  let run = null;
  let lastRunId = null;
  let lastRunOrdinal = 0;
  let disposed = false;
  let lastGain = { from: volumeLevel, to: volumeLevel, start: 0, end: 0 };
  const buffers = new Map();
  const journal = [];
  const retiringRuns = new Set();
  const counts = { scheduled: 0, duplicates: 0, stale: 0, silent: 0, late: 0, stolen: 0, hardCuts: 0, peakVoices: 0, peakSources: 0 };
  const impulse = roomBuffer(context);
  const master = context.createGain();
  master.gain.value = volumeLevel;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -8;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.16;
  const ceiling = context.createWaveShaper();
  ceiling.curve = Float32Array.from({ length: 2049 }, (_, i) => protectPeak(i / 1024 - 1));
  master.connect(compressor).connect(ceiling).connect(context.destination);

  function masterGainAt(now) {
    const progress = now >= lastGain.end ? 1 : Math.max(0, (now - lastGain.start) / (lastGain.end - lastGain.start));
    return lastGain.from + (lastGain.to - lastGain.from) * progress;
  }

  function smoothMasterGain() {
    const now = context.currentTime;
    const held = masterGainAt(now);
    const target = muted ? 0 : volumeLevel;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(held, now);
    master.gain.linearRampToValueAtTime(target, now + CONTROL_RAMP_SEC);
    lastGain = { from: held, to: target, start: now, end: now + CONTROL_RAMP_SEC };
  }

  function sampleBuffer(intent) {
    const key = [intent.voice, intent.pitchHz, intent.attackSec, intent.releaseSec, intent.brightness].join("/");
    if (buffers.has(key)) {
      const cached = buffers.get(key);
      buffers.delete(key);
      buffers.set(key, cached);
      return cached;
    }
    const samples = renderVoiceSamples(intent, context.sampleRate);
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    if (buffers.size >= CACHE_LIMIT) buffers.delete(buffers.keys().next().value);
    buffers.set(key, buffer);
    return buffer;
  }

  function disconnectVoice(owner, voice) {
    if (!owner.sources.delete(voice)) return;
    owner.active.delete(voice);
    voice.source.onended = null;
    voice.source.disconnect();
    voice.level.disconnect();
    voice.pan.disconnect();
    voice.send.disconnect();
  }

  function stopVoice(owner, voice, stop, fadeSec) {
    owner.active.delete(voice);
    const now = context.currentTime;
    if (voice.start >= stop) {
      voice.source.stop(now);
      disconnectVoice(owner, voice);
      return;
    }
    if (voice.end <= stop) return;
    const fadeStart = Math.max(now, voice.start, stop - fadeSec);
    voice.level.gain.cancelScheduledValues(fadeStart);
    voice.level.gain.setValueAtTime(voice.gain, fadeStart);
    voice.level.gain.linearRampToValueAtTime(0, stop);
    voice.end = stop;
    voice.source.stop(stop);
  }

  function disconnectRun(owner) {
    retiringRuns.delete(owner);
    for (const voice of owner.sources) disconnectVoice(owner, voice);
    owner.gate.disconnect();
    owner.room.disconnect();
    if (owner.timer) {
      owner.timer.onended = null;
      owner.timer.disconnect();
    }
  }

  function fence({ immediate = false, preserveBoundary = false } = {}) {
    if (!run) return;
    const old = run;
    run = null;
    const now = context.currentTime;
    const end = now + FENCE_RAMP_SEC;
    for (const voice of old.sources) {
      const pending = preserveBoundary ? voice.start > now : voice.start >= now;
      if (pending || immediate) {
        voice.source.stop(now);
        disconnectVoice(old, voice);
      } else if (voice.end > end) {
        voice.source.stop(end);
      }
    }
    if (immediate || disposed) {
      disconnectRun(old);
      return;
    }
    old.gate.gain.setValueAtTime(1, now);
    old.gate.gain.linearRampToValueAtTime(0, end);
    const timer = context.createConstantSource();
    old.timer = timer;
    timer.onended = () => disconnectRun(old);
    timer.start(now);
    timer.stop(end);
    retiringRuns.add(old);
    // A rapid reset loop cannot accumulate convolution graphs while the context is frozen.
    if (retiringRuns.size > 2) disconnectRun(retiringRuns.values().next().value);
  }

  function beginRun(runId) {
    if (disposed) throw new Error("Mixer disposed");
    if (typeof runId !== "string" || !runId) throw new TypeError("A run ID is required");
    if (run?.id === runId) return;
    fence();
    const gate = context.createGain();
    const room = context.createConvolver();
    room.normalize = false;
    room.buffer = impulse;
    room.connect(gate).connect(master);
    if (runId !== lastRunId) {
      lastRunId = runId;
      lastRunOrdinal = 0;
    }
    run = { id: runId, gate, room, active: new Set(), sources: new Set(), lastTime: 0 };
  }

  // Call in presentation order. Sim timestamps stay in the intent, and the
  // supplied audio timestamp is the runtime's already converted clock time.
  function schedule(intent, audioSec) {
    if (!intent) return false;
    const owner = run;
    if (!owner || intent.runId !== owner.id) {
      counts.stale++;
      return false;
    }
    const ordinal = /^e[1-9][0-9]*$/.test(intent.eventId) ? Number(intent.eventId.slice(1)) : NaN;
    if (!Number.isSafeInteger(ordinal)) throw new RangeError("Expected a canonical activation event ID");
    if (ordinal <= lastRunOrdinal) {
      counts.duplicates++;
      return false;
    }
    if (!Number.isFinite(audioSec) || audioSec < owner.lastTime) {
      throw new RangeError("Expected audio time in presentation order");
    }
    lastRunOrdinal = ordinal;
    owner.lastTime = audioSec;
    if (intent.gain <= 0) {
      counts.silent++;
      return false;
    }

    const buffer = sampleBuffer(intent);
    const now = context.currentTime;
    const start = Math.max(now, audioSec);
    if (start > audioSec) counts.late++;
    for (const voice of owner.active) {
      if (voice.end <= start) owner.active.delete(voice);
    }

    if (owner.active.size >= maxVoices) {
      const oldest = owner.active.values().next().value;
      // The event gets its original slot. If that slot is imminent, the displaced
      // voice fades over the following few ms instead of jumping to zero.
      stopVoice(owner, oldest, oldest.start === start ? start : Math.max(start, now + STOLEN_RAMP_SEC), STOLEN_RAMP_SEC);
      counts.stolen++;
    }
    if (owner.sources.size >= maxVoices + RETIRING_LIMIT && typeof context.startRendering !== "function") {
      for (const voice of owner.sources) {
        if (!owner.active.has(voice)) {
          voice.source.stop(now);
          disconnectVoice(owner, voice);
          counts.hardCuts++;
          break;
        }
      }
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    const level = context.createGain();
    level.gain.value = intent.gain;
    const pan = context.createStereoPanner();
    pan.pan.value = intent.pan;
    const send = context.createGain();
    send.gain.value = intent.reverbSend;
    source.connect(level).connect(pan).connect(owner.gate);
    pan.connect(send).connect(owner.room);

    const voice = { source, level, pan, send, start, end: start + buffer.duration, gain: intent.gain };
    source.onended = () => disconnectVoice(owner, voice);
    owner.sources.add(voice);
    owner.active.add(voice);
    source.start(start);
    counts.scheduled++;
    counts.peakVoices = Math.max(counts.peakVoices, owner.active.size);
    counts.peakSources = Math.max(counts.peakSources, owner.sources.size);
    journal.push({ runId: intent.runId, eventId: intent.eventId, tMs: intent.tMs, requestedAudioSec: audioSec, audioSec: start });
    if (journal.length > JOURNAL_LIMIT) journal.shift();
    return true;
  }

  return {
    beginRun,
    fence,
    schedule,
    setVolume(value) {
      volumeLevel = clampVolume(value);
      smoothMasterGain();
    },
    setMuted(value) {
      muted = Boolean(value);
      smoothMasterGain();
    },
    diagnostics() {
      const now = context.currentTime;
      let activeVoices = 0;
      for (const voice of run?.sources ?? []) {
        if (voice.start <= now && now < voice.end) activeVoices++;
      }
      return {
        ...counts, runId: run?.id ?? null, activeVoices, liveSources: run?.sources.size ?? 0,
        cacheBuffers: buffers.size, volume: volumeLevel, muted, masterGain: masterGainAt(now),
        recent: journal.map((entry) => ({ ...entry })),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      fence({ immediate: true });
      for (const old of retiringRuns) disconnectRun(old);
      master.disconnect();
      compressor.disconnect();
      ceiling.disconnect();
      buffers.clear();
    },
  };
}
