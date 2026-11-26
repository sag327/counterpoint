# Sound tickets 04a and 04b, attempt 01

Contract 1.0.0. Music mapping, mixer and comparative renders are ready for integration review. Human audition pending.

## Implementation

- `src/music/mapping.js` maps each accepted Circulation activation to its own immutable NoteIntent. Its run ID, event ID and time come directly from the event. Nonactivations produce no intent. The gain, spectral brightness and release reflect pre-capture recovery with an audible floor.
- `src/music/synthesis.js` generates four original acoustic-inspired voices from tapered, time-varying partials, filtered excitation and restrained bow vibrato. It also generates the shared stereo room impulse.
- `src/music/mixer.js` uses one one-shot buffer source per voice with a 48-buffer LRU cache, stereo panning, per-run dry/room bus, ramped master gain and mute, compression and a soft ceiling. Overload makes room for a new onset by retiring the oldest voice. The default active budget is 32 plus up to eight transient source retirements in the current run. Each fence cancels future old-run sources and silences the old room, with a 12 ms reset ramp or immediate interruption fence. The manual pause option `fence({preserveBoundary: true})` lets an onset at the inclusive committed boundary begin and fade.
- `src/music/index.js` exports `mapActivation(event, {voicing, palette, nodes})`, `CHAMBER_VOICINGS`, `PALETTES` and `createAudioMixer(context, {volume, maxVoices})`. The runtime owns AudioContext creation, gestures and the wall/simulation conversion. Call `beginRun(runId)` before ordered `schedule(note, audioSec)` calls. Call `fence({immediate: true})` on interruption. Reopen that same run on resume to preserve the event watermark and start a fresh room. Mixer controls are `setVolume`, `setMuted`, `diagnostics` and `dispose`.

## Reproduction

Run with Node.js v24.22.3 on Linux x64.

```sh
node --test tests/music.test.js
node tests/music-offline.js evidence/audio
```

M01/M02 fixture joins return 8/8, 25/25 and 28/28 for A, B and C, with zero unmatched identities and zero intents for nonactivations. At 240 sim ms in B, two captures are mapped, R0 and merged R4. At 300 sim ms one capture is mapped, R7. The R1 block has 60 sim ms ERP remaining and returns null. M03 tests confirm palette changes preserve event identities and times. The tests also exercise scheduling identities, manual pause at the inclusive boundary, reset and interruption fences, resume, and mute/volume ramps, using a fake AudioContext to inspect graph operations. All five tests pass.

M09 audition takes use contract fixture C, a hand-authored reference passage that includes induction and a cut. The equivalent PCM render shares the production voice and room algorithms. The three takes have the same 28 onsets, 150 ms lead-in, 4× dilation, per-note parameters other than pitch, and 30% volume. There is no per-take loudness normalization. The WAV files contain 10 seconds of stereo 16-bit PCM at 24 kHz.

| Take | Pitch layout | Stereo peak | Mono peak | Maximum absolute DC | Final 500 ms peak |
|---|---|---:|---:|---:|---:|
| [Balanced](../../evidence/audio/chamber-balanced.wav) | Handoff layout | 0.100 | 0.096 | 0.000001 | 0 |
| [Open](../../evidence/audio/chamber-open.wav) | Lower A at R5, C at R6, G/A inner voices at R2/R3 | 0.084 | 0.082 | 0.000005 | 0 |
| [Suspended](../../evidence/audio/chamber-suspended.wav) | G at R1, C/E at R2/R3, A at R4 | 0.091 | 0.088 | 0.000001 | 0 |

Equivalent PCM stereo peaks for Balanced at 1× and 8× were 0.131 and 0.075. Across all five renders the largest adjacent-sample change was 0.016 full scale. Every sample was finite, with zero samples at clipping and zero signal in the final 500 ms. Rendering and measuring each whole passage took 0.23–0.35 s in this run.

M10 exercised 200 densely scheduled onsets against a six-voice budget. All were scheduled, 194 displaced older tails, the active voice peak was six, and allocations in the current run stayed at or below 14. Emergency cuts can truncate a fade when all eight spare retirement slots are occupied. They are counted separately. All sources were released by five seconds in the clock simulation. M11 verified zero-gain mute and return ramps with a volume change during a previous ramp, using graph operations.

The equivalent PCM render omits the native Web Audio compressor and device latency. Browser behavior, real-time DSP cost, mobile performance and subjective listening are separate integration and audition checks. Integration should join the actual engine events against audio diagnostics before using the takes for creator review.
