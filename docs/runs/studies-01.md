# Study worlds receipt 01: ticket 12a (Echo)

**Attempt 01. Release slice v0.2 ships Echo only, so this receipt covers Echo.** Branch `study-2-studies`, based on `study-2` at 43aeef2, with `study-2` (contract follow-ups 11e) merged in before the final commit. Node v24. Run `npm test` from the project root: 137 tests pass. That includes `tests/studies-echo.test.js` and `tests/studies-lint.test.js`.

## What landed

- `src/worlds/kit.js`. Shared builders for 1.1.0 worlds: `site`, `way`, `link`, `both`, `sinusFocus`, `world`, `deepFreeze`, the D-Dorian `PITCH` table, `music()` (audible sites map to `[midi, voice, pan]`, silent sites to `null`, so `describeNodeMusic(…, { nodes })` returns null for them), and the protocol helpers `stim` and `pace`.
- `src/worlds/echo.js`. `createEchoWorld()`, the frozen `echoWorld` and `echoPresentation`: layout, tiers, staves, music and protocols.
- `src/worlds/studies.js`. The registry `STUDIES` (Echo only) and `studyById`.
- `tests/studies-common.js`. Run helpers and `assertLaws`, which recomputes every capture's §A ERP and every launch's decrement and §B entry part from event fields and world parameters alone.
- `tests/studies-echo.test.js`. The four Echo oracles plus the law check.
- `tests/studies-lint.test.js`. Runs for every registered study and checks:
  - the factory deep-equals the frozen preset;
  - the world reads as 1.1.0;
  - `lintStudyWorld` returns no findings;
  - nodal and sinus sites are `audible: false` and map to null;
  - every audible site has a pitch in D-Dorian, in its tissue's register and voice;
  - layout covers every site within −1..1, tiers cover each site exactly once, and staves are exactly the audible sites;
  - protocols only enqueue `stimulate` / `stimulateTrain`, and the engine accepts the commands.
- The v1 presets (conduction, circulation, duality) are untouched.

## Echo: target against achieved

| Oracle (spec II + G1 correction 4) | Target | Achieved | Status |
| --- | --- | --- | --- |
| AH curve, drive 8 × 600 ms from CSp | Smooth (< 40 ms per 10 ms step), then a jump of at least 50 ms at the fast-pathway ERP, below 300 ms | Fast-pathway AH rises 2.1–5.7 ms per 10 ms step, from 111.5 ms at S2 400 to 148.5 ms at S2 300. At 1 ms resolution it jumps 300 → 299 by +100.9 ms (to 249.4). FP is blocked from S2 299 down. | PASS |
| Single echo | One 20 ms-wide S2 window with exactly one echo (CSp captured from FP) | S2 264–239 ms (26 ms): exactly one echo, then block in FP on the second lap. The test checks 260–240 in 2 ms steps. | PASS |
| Sustained circulation | 60 s, CSp→V 10–60 ms | S2 299–265 sustains. At S2 280 it runs past 60 s with a steady lap of 285.1 ms and CSp→V 17.6–18.0 ms; His conducts 1:1. | PASS |
| Stillness | Ends circulation within 3 laps, by nodal block, never by a cut | Applied 3000 ms into circulation, it blocks retrogradely in FP 378.9 ms later (1.3 laps). No echo follows and there is no `link_changed`. | PASS |
| Laws | – | Every ERP and launch in an S1–S2 run lies on §A, the decrement law and §B, recomputed from events | PASS |

Lab-facing values from the same runs:

- Late-coupled CSp→V is AH + 35 ms: 146.5 ms at S2 400.
- The slow-pathway (SP) ERP blocks S2 at 238 ms and below.
- Atrial (CSp) capture fails at 229 ms and below.

## Echo parameters (final)

| Site | Tissue | Audible | ERP / restitution (Emax, A, τ) | Pitch / voice / pan |
| --- | --- | --- | --- | --- |
| S | sinus | no | 200, 800 ms focus, reset, overdrive 0.06 / 450 / 0.6 | – |
| HRA | atrial | yes | 230, 60, 80 | D4 felt −0.2 |
| CSp | atrial | yes | 230, 60, 80 | F4 pluck +0.1 |
| FP | nodal | no | **304**, 60, 120 | – |
| SP | nodal | no | 240, 40, 100 | – |
| LCP | nodal | no | 250, 60, 120 | – |
| H | hisPurkinje | yes | 360, **160, 200** | A5 glass 0 |
| V | ventricular | yes | 250, 60, 80 | D3 bow +0.15 |

| Link | Ends | Delay | Decrement | Entry |
| --- | --- | --- | --- | --- |
| SH | S–HRA, **bidirectional** | 25 | – | – |
| HC | HRA–CSp | 30 | – | 15 / 40 |
| CF | CSp–FP | 10 | – | 20 / 60 |
| FL | FP–LCP | 30 | 30 / 100 | 20 / 60 |
| CS | CSp–SP | 50 | – | 20 / 60 |
| SL | SP–LCP | **100** | 60 / 120 | 30 / 80 |
| LH | LCP→H | **55** | – | 10 / 40 |
| HV | H→V | 35 | – | 10 / 40 |

Bold values depart from the spec's starting table. Each departure is explained below.

**Presentation.**

- Tiers: S·HRA·CSp, FP, SP, LCP, H, V.
- Staves: HRA, H, CSp, V (EP channel order).
- Protocols:
  - "Find the echo" (Lab name: S1–S2 decremental atrial extrastimulus, drive 600 ms). Eight pulses at 600 ms from 200 ms, then S2, stepped from 400 to 200 ms in −10 ms steps.
  - "Find the chord": the same with an optional S3.

## Spec-text corrections proposed (Echo)

1. **Sustained cycle and AH.** In the spec, "a rolled chord repeating every 303 ms" and "about 15 ms apart" are v0.1 numbers. The honest v1.1 tuning gives a lap of 285 ms and CSp→V of 18 ms, and the post-jump AH is 249–280 ms rather than 288. Proposed text: "a rolled chord repeating about every 285 ms, atrium and ventricle about 18 ms apart".
2. **His restitution.** The spec's H law (360, 140, 150) is bistable between 1:1 and 2:1 at the circulation rate. The first circulating His beat follows a long DI, its ERP of about 313 ms exceeds the 307 ms lap, and His then stays locked in 2:1. With (360, 160, 200), His conducts 1:1 from the first lap, settling near 246 ms. The rested ERP stays 360 ms, so the audit's corrected gradient holds.
3. **Single echo against sustained circulation.** With the spec's starting values (FP 300, SL 160) every jump S2 sustains, so no single-echo window exists. The second lap's retrograde FP margin is the circuit lap minus the FP ERP left by the first long DI. That margin is nearly independent of S2 (36–40 ms). The window appears only when the lap is about 30 ms shorter. Two changes achieve this:
   - SL 160 → 100 ms;
   - FP Emax 300 → 304 ms, which also keeps the jump below 300.

   Long S2 then sustains and short S2 gives one echo. Proposed text: "S2 from 299 to 265 ms sustains circulation; 264 to 239 ms gives exactly one echo".
4. **"Find the chord" (S3).** In this tuning an S3 does not convert a single echo into sustained circulation: no S2 ≤ 260 with any S3 from 200 to 300 sustained. S2 alone from 299 to 265 sustains, so the label holds, but the spec's "if a single one does not sustain" should read "S3 is optional".
5. **LH 40 → 55 ms.** With the shorter lap, CSp→V was only 2.8 ms, below the oracle's 10 ms floor. Lengthening LH by 15 ms gives 18 ms.
6. **SH bidirectional.** The spec table makes SH one-way. Then the 800 ms sinus keeps firing into the 600 ms drive and the 285 ms circulation, and its beats perturb the S1–S2 protocol. With retrograde entry into S, atrial pacing and the circuit overdrive the sinus node, which is realistic and matches Prelude's §C. S stays silent (sinus tissue).

## Engine requests

None needed for Echo. For later slices:

- Stillness in a fast ring gives high-grade nodal block (about 4:1), not a silent ventricle. Nodal ERP + 600 ms recovers within four laps of 268 ms. If the spec wants silence, the agent needs a larger nodal term or a dose above 1 (see Ostinato below).

## Other studies: unfinished, not in v0.2

Per the lead's scope change, the other worlds are withdrawn from `src/worlds`. Commit c87aa5f removes them, and they remain recoverable from **1fb45e6**:

- **Prelude, Meter and Ostinato.** Each passed its draft oracles at 1fb45e6, as `src/worlds/{prelude,meter,ostinato}.js` and `tests/studies-*.test.js`.
- **Hemiola.** A draft exists only as an uncommitted local file. Its B firing times matched the hand iteration, but one plateau check was failing at a = 0.155 (281 beats, not 280; the G1 plateau edge needs the review's exact window).
- **Retrograde, Ghost and Canon.** Not started.

Draft findings to carry into a later slice:

- **Prelude.** Matched §C exactly: 1250, 1070, 962 and 897.2 ms, with Breath RR within one tick.
- **Meter.** Needed strong §B entry on N2→N3 (125/100) and ERPs of 280/300/300. That gives 1:1 / 1:1 / 10:9 / 4:3 / 3:2 / 2:1 at 600 / 450 / 400 / 360 / 330 / 300, with 5:4 at 380–385. The spec's "5:4 at 400" should read "long Wenckebach groups (10:9) at 400, 5:4 near 380".
- **Ostinato.** Cycle 268.1 ms and V 2:1. Under Slow (dose 1) the lap is 350 ms and V runs 1:1. A complete isthmus lesion stops the figure at p = 1. Entrainment gives PPI − TCL of +2.8 ms from R0 and +104 ms from X.
