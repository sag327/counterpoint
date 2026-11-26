const voices = {
  felt: {
    // Ratio, level, exponential decay. Mildly stretched upper strings.
    partials: [[1, 0.76, 3.8], [2.002, 0.14, 7], [3.011, 0.065, 13], [4.027, 0.026, 19]],
    noise: 0.045, noiseDecay: 120, noiseHz: 1900, body: 1,
  },
  pluck: {
    partials: [[1, 0.62, 4.2], [2, 0.20, 5.8], [3, 0.10, 9], [4, 0.042, 12], [5, 0.024, 16]],
    noise: 0.035, noiseDecay: 140, noiseHz: 2600, body: 1,
  },
  bow: {
    partials: [[1, 0.66, 2.4], [2, 0.20, 3.1], [3, 0.085, 4.8], [4, 0.037, 7]],
    noise: 0, noiseDecay: 1, noiseHz: 1, body: 1.15, vibrato: 0.035,
  },
  glass: {
    partials: [[1, 0.80, 3.4], [2.005, 0.095, 5.4], [2.73, 0.044, 8], [3.99, 0.029, 14]],
    noise: 0, noiseDecay: 1, noiseHz: 1, body: 0.86,
  },
};

export const ROOM_SEC = 1.8;
export const ROOM_TAPS = 160;

function smoothstep(value) {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
}

function seededNoise(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2147483648 - 1;
  };
}

// A voice is one buffer source. The waveform contains its own time-varying
// spectrum and release, so resource use does not depend on the partial count.
export function renderVoiceSamples(note, sampleRate) {
  const profile = voices[note.voice];
  const seconds = note.attackSec + note.releaseSec;
  const samples = new Float32Array(Math.ceil(seconds * sampleRate));
  const radiansPerSample = 2 * Math.PI / sampleRate;
  const partials = profile.partials
    .filter(([ratio]) => note.pitchHz * ratio < sampleRate * 0.45)
    .map(([ratio, level, decay], i) => ({
      advance: note.pitchHz * ratio * radiansPerSample,
      ratio,
      level: i === 0 ? level : level * note.brightness,
      decay: Math.exp(-decay / (note.releaseSec * sampleRate)),
    }));

  const jitter = seededNoise(624137);
  const noiseFilter = 1 - Math.exp(-profile.noiseHz * radiansPerSample);
  const noiseDecay = Math.exp(-profile.noiseDecay / sampleRate);
  let noiseLevel = profile.noise * note.brightness;
  let filteredNoise = 0;
  for (let i = 1; i < samples.length - 1; i++) {
    const time = i / sampleRate;
    const envelope = smoothstep(time / note.attackSec) * smoothstep((seconds - time) / (0.30 * note.releaseSec));
    const vibrato = profile.vibrato
      ? profile.vibrato * smoothstep(time / 0.18) * Math.sin(2 * Math.PI * 4.6 * time)
      : 0;
    let signal = 0;
    if (noiseLevel > 0.00001) {
      filteredNoise += (jitter() - filteredNoise) * noiseFilter;
      signal += filteredNoise * noiseLevel;
      noiseLevel *= noiseDecay;
    }
    for (const partial of partials) {
      signal += partial.level * Math.sin(i * partial.advance + partial.ratio * vibrato);
      partial.level *= partial.decay;
    }
    samples[i] = signal * envelope * profile.body;
  }
  return samples;
}

// The shared impulse is locally generated and decorrelated between channels.
// Its low reflection gains preserve the distinction between an attack and its room.
export function roomTaps(sampleRate, channel) {
  const noise = seededNoise(200719 + channel * 839);
  const predelay = 0.017;
  return Array.from({ length: ROOM_TAPS }, (_, i) => {
    const fraction = (i + (noise() + 1) / 2) / ROOM_TAPS;
    const time = predelay + fraction * (ROOM_SEC - predelay);
    const decay = (1 - fraction) ** 1.7 * Math.exp(-2.8 * fraction);
    return [Math.floor(time * sampleRate), noise() * decay * 0.095];
  });
}

export function protectPeak(sample) {
  const magnitude = Math.min(1, Math.abs(sample));
  return magnitude <= 0.76
    ? sample
    : Math.sign(sample) * (0.76 + 0.17 * Math.tanh((magnitude - 0.76) / 0.17));
}
