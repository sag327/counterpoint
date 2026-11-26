# 09b Music mapping and palettes, attempt 02

The P0 mapping and mixer are the base. Contract 1.0.0 remains in use. The mapping, mixer diagnostics and reproducible offline renders are ready for integration review. Human audition is pending.

## Node identities

| World | Node | Pitch | Voice | Pan |
|---|---|---|---|---:|
| Conduction | S | D4 | Felt | 0 |
| Conduction | A | A4 | Pluck | −0.15 |
| Conduction | N | F4 | Glass | +0.12 |
| Conduction | H | C5 | Pluck | 0 |
| Conduction | V1 | D3 | Bow | −0.22 |
| Conduction | V2 | A3 | Felt | +0.22 |
| Duality | A | D4 | Felt | −0.23 |
| Duality | A1 | F4 | Pluck | −0.28 |
| Duality | A2 | A4 | Glass | −0.18 |
| Duality | B | D3 | Bow | +0.23 |
| Duality | B1 | G3 | Felt | +0.28 |
| Duality | B2 | C4 | Glass | +0.18 |

Conduction uses the handoff's pitches and assigns a complementary felt tone above the lower bowed string. Duality places the higher D/F/A cluster slightly left and the lower D/G/C cluster slightly right. Revisit the assignments after listening to the matched takes. Balanced, Open and Suspended remain Circulation voicings. Chamber, Atmosphere and Minimalism apply to all three worlds and keep the same node identities while scaling gain, attack, release, brightness and room send.

`src/music/index.js` exports `describeNodeMusic(worldId, nodeId, {voicing, nodes})`. It returns `pitchMidi`, `pitchHz`, `voice` and `pan` from the same lookup used by `mapActivation`. An explicitly silent custom assignment returns `null`. The mixer exposes the instantaneous ramped `masterGain` and `activeVoices`, counting currently sounding sources of the current run. `liveSources` also includes sources queued for a future onset.

## Reproduction and results

Run with Node.js v24.22.3 on Linux x64.

```sh
node --test tests/music.test.js
node tests/music-offline.js /tmp/counterpoint-ring
node tests/music-offline.js --worlds /tmp/counterpoint-worlds
```

- **M01–M03, fixtures and actual engine.** All six music tests passed. The Circulation A, B and C joins mapped 8, 25 and 28 captures respectively. The Conduction test mapped 31 captures through 3,400 sim ms after an A stimulus at 260 sim ms and verified that N's block generated no note. Duality mapped 27 captures through 3,400 sim ms with independent automaticity and no extra commands. All palettes produced the same run IDs, event IDs and simulation times as their accepted activations and left tested histories and states unchanged. Each built-in node's inspector identity matched its mapped notes. Fake AudioContext checks covered the current voice count, gain ramp reads and playback fences.
- **M09, equivalent PCM.** The earlier Circulation fixture takes reproduced byte-for-byte against `evidence/audio/chamber-{balanced,open,suspended}.wav`. The `--worlds` takes use actual engine events through 4,500 sim ms, the 4× dilation and a 150 ms lead-in. Conduction schedules a single A stimulus at 275 sim ms and produces 41 captures. Duality runs with zero commands and produces 36 captures. Each world uses one event stream for its three 22-second, 24 kHz stereo WAVs. The renderer shares the voice and room algorithms with the production mixer and applies 30% master volume without normalization.

| World | Palette | Stereo peak | Mono peak |
|---|---|---:|---:|
| Conduction | Chamber | 0.073 | 0.073 |
| Conduction | Atmosphere | 0.063 | 0.063 |
| Conduction | Minimalism | 0.060 | 0.059 |
| Duality | Chamber | 0.077 | 0.071 |
| Duality | Atmosphere | 0.070 | 0.067 |
| Duality | Minimalism | 0.061 | 0.055 |

Every offline sample was finite. No render clipped. Maximum absolute DC was below 0.000005 full scale and the largest adjacent-sample change was below 0.011. The final 500 ms was silent in each new render. The equivalent PCM path omits the browser's Web Audio compressor and device latency. Runtime palette switching and inspector presentation belong to integration review. The creator's listening judgment and real-device playback remain unverified by this receipt.

Files changed are `src/music/index.js`, `src/music/mapping.js`, `src/music/mixer.js`, `tests/music.test.js`, `tests/music-offline.js` and this receipt.
