# Contract 1.1.0 receipt for 11a, 11b, 11c and 11d

**Attempt 01, ready for independent G1 review.** Branch `study-2-contract`, based on `study-2` at 806459d. This run used Node v24 and Python 3 with `jsonschema`. The engine stays dependency-free and deterministic: integer microsecond ticks, no `Math.random`, no wall clock. Reproduce from the project root:

```sh
npm test                                   # 87 tests: 47 v0.1 tests plus 40 new in tests/engine-v11.test.js
python3 tests/check_contract.py            # 1.0.0 fixtures, 1.1.0 schemas, 1.1.0 evidence
node tests/engine-v11-evidence.js > evidence/engine-v11-01.json
python3 tests/engine-contract-v11.py       # 18 actual 1.1.0 traces and the coupling sweep
npm run build                              # verified; see "dist" below
```

## What changed

- **11a.** `contracts/{world,command,event}.v1_1.schema.json` are strict supersets of the untouched 1.0.0 files. `readWorld` reads a world as 1.1.0 when it declares contractVersion "1.1.0" or carries any new field. `readCommand` accepts the nine new commands on 1.1.0 runs only. The new sections are in contracts/README.md ("Counterpoint contract 1.1.0") and DECISIONS.md ("Contract 1.1.0").
- **11b.** §A restitution (`diastolicIntervalMs` on activation), §B entry slowing (`delayParts` on conduction_launched), §C overdrive suppression, autonomic breath and `setTone`.
- **11c.** §D coupling (protected foci, cause `protected`, `phase_modulated`, `setCoupling`). §F lesions (`ablate`, `lesion_changed`, stepwise `parameter_changed` with cause `lesion`). `stimulateTrain`, `cancelTrain` and `train_completed`. `applyAgent` Stillness and Slow. `setRestitution`, `setDecrement` and `setEntry`.
- **11d.** §E concealed conduction (`tissue` and `audible` accepted and exposed; no new rule). The one-instant ordering, with a regression test per rule (O1–O6). Train limits: at most 64 pulses, cycle at least 150 ms, start not before the command, at most `maxConcurrentTrains` (default 4) overlapping trains judged from the command log only, and every pulse charged to the processing budget.
- **Code.** The pure laws are in `src/engine/laws.js`. Orchestration is in `src/engine/index.js`, parsing in `src/engine/input.js`, and the 1.1.0 snapshot fields in `src/engine/history.js`. Scenes are in `tests/engine-v11-scenes.js`, oracles in `tests/engine-v11.test.js`, the evidence generator in `tests/engine-v11-evidence.js` and the validator in `tests/engine-contract-v11.py`. Evidence is in [engine-v11-01.json](../../evidence/engine-v11-01.json).

## v1 regression (G1 first gate)

The A, B and C fixtures and `ring.json` match the 1.1.0 code, compared by value as E14 does. The hand-authored fixtures use a different key order, so the same engine traces are compared byte for byte against `evidence/engine-01.json`. Both committed evidence files, `engine-01.json` and `worlds-01.json`, regenerate byte for byte from the 1.1.0 engine. That covers 1,682 events, and every one of them also validates under the 1.1.0 schemas. `ring.json` marked 1.1.0 gives identical dynamics: after removing the three 1.1.0 annotations, its events are byte-identical to the 1.0.0 trace. All 47 pre-existing tests pass unchanged. No frozen fixture or expectation was edited.

## Oracle table

Every "expected" value is computed in the test from the law in closed form, by bisection, or by an explicit hand recurrence. None is read back from the engine.

| Oracle | Expected (spec or hand) | Actual engine |
| --- | --- | --- |
| §A, CL 340, E 300 / A 200 / τ 60 | Fixed point 253.048 ms, slope 0.783 (spec ≈253, ≈0.78). The sequence follows the closed-form iteration. | 300, 197.317, 281.454, 224.619, 270.767 … settles at 253.048. Matches the iteration on all 64 beats. |
| §A, CL 300 | Fixed point 233.727, slope 1.105 > 1 (spec ≈233, ≈1.1). Alternans. | 300, 100, 292.865, 122.424 … settles into a 285.242 / 143.610 alternation. Matches the iteration on all 64 beats. No block. |
| §B entry ring (8 × 35 ms, entry 20/60, restitution 220/80/60) | Varies lap to lap, then under 5 ms after lap 3. Steady cycle C* = 310.029 ms, fixed point of the §A + §B laws. | Laps 309.853, 308.406, 310.915, 309.763, 310.083 … 310.032 (2.6 ticks from C*). Every launch's entry part equals the law recomputed from event fields. |
| §B resetting curve | Monotonic. Flat at exactly 8 × 35 ms without entry. | 19 S2 couplings from 300 to 210 ms (5 ms steps). The return cycle rises strictly from 313.504 to 362.542 ms. The no-entry control is flat at 280. |
| §C overdrive, 30 × 500 into 800 | Returns 1250, 1070, 962, 897.2 ms (±1 tick) | 1250, 1070, 962, 897.2, exact. suppressionMs 450 at the last pulse. |
| §C pauses | Non-reset 2 × 800. Reset 800 + 500. Reset with overdrive 800 + 500 + 18. | 1600, 1300, 1318 |
| §C Breath (P 4000, d 0.05) | RR = round(800 (1 + d sin 2πt/P)) within one tick | Exact. RR spans 760–840. Nodal targets scale decrement only. |
| §C setTone +1 | Pending beat unchanged, later cycles 960 ms. NH decrement × 1.5. | 0, 800, 1760, 2720 … Decrement matches. |
| §D sweep, Duality 720/1030, a 0–0.25 step 0.005 plus 0.1825 and 0.184 | Firing times from an independent event-level iteration of the §D law. 2:3 at 0.155–0.205, 5:7 near 0.1825, 3:4 at 0.21–0.22. | B firing times are identical to the iteration at all 53 amplitudes. B beats per 420 A cycles: 280 (2:3) for 0.155–0.205, 300 (5:7) at 0.1825 and 0.184, 315 (3:4) for 0.21–0.22. |
| §E chain, CL 300 | Hand recurrence: 4:3, AH 179.5 → 210.067 → 230.701 then block at N3, decreasing increments (30.6, 20.6). The blocked beat captures N1 and N2 only (concealed). | Identical H times and N3 blocks (remaining 11.692 ms). Groups CCCx ×6. The same chain is 1:1 at 320 and 3:2 at 280. |
| §F complete ablation of L5 during reentry | Hand recurrence: R0 at 2160, 2642.813, 3148.126, 3698.439. The R6 launch at 3818.439 is cancelled at p = 1 (4000 ms). | Identical. Transit cancelled with cause lesion at 4000. Last capture R6 at 3818.439. Quiescent. |
| §F completeness 0.5 | Steady lap 420 + 60 × 1.75 = 525 ms | 525, exact. A second pass from 0.5 to 1 closes the line at 7000. |
| Trains, agents, ordering | triggerId `<id>#<k>`, cancel emits nothing, the cap is replay-safe, a budget fault occurs at pulse 34 under budget 100. Stillness and Slow laws written out independently. One-instant rules O1–O6. | All exact (tests V11-O*, V11-T*, V11-G*) |
| v0.1 claims | Conduction paced from A is 1:1 for 600 → 280 ms. Echo (fp 300, sl 160, H 250): AH 110 at S2 300, ≈288 at 296 (+178). | 120/120 at every cycle. AH 110 at 300 and 287.625 at 296 (+177.625). |

Determinism: a mixed 1.1.0 scene with a train, Stillness, a lesion, tone, Slow and coupling gives identical events under one-shot, 10 ms and irregular advancement.

## Spec corrections

1. **§D above 0.22 (and Hemiola).** "Above that it becomes irregular" is only partly true. The engine maps 2:3 for a = 0.1550–0.2075 (5:7 at 0.1825 and 0.1840–0.1845), 3:4 for 0.2080–0.2220, **2:3 again for 0.2225–0.2380**, and irregular from 0.2385 (0.0005-step scan). The spec's own prototype shows the same returns.
2. **§D phase domain.** The numbers in the spec come only from a PRC applied for 0 ≤ φ < 1. The prototype in labplate.py ignores inputs outside the current cycle. With a periodic sine the 5:7 window disappears, the 2:3 plateau widens to 0.1507–0.2076, and 2:3 runs on from 0.2212 to about 0.245. The spec formula should state this domain, which is implemented here.
3. **§E wording.** "Wenckebach periodicity emerges from progressive decrement along the chain" cannot hold with source decrement alone. In a feed-forward chain at a constant drive cycle, every site's recovery is periodic, so decrement is the same on every beat. The progression comes from §B entry slowing, where the destination's recovery feeds back on the next delay. The 4:3 fixture therefore uses entry slowing into N3 (60/60) on top of decrement in N1→N2 and N2→N3.
4. **Echo jump location.** With 1 ms steps, the AH jump occurs at the first S2 below the fast-pathway ERP (AH is 110 at 300 ms; at 299 the curve has already jumped). "Jumps at 296" reflects the 4 ms grid of ahcurve.mjs. The values at 300 and 296 hold as stated: 110 and 287.6 ms.
5. **§B oracle strength.** In a 60 ms-link ring like Circulation, lap variation is below 0.02 ms, so the "< 5 ms" check is trivially met. The fixture uses 35 ms links (excitable gap ≈ 104 ms), where variation is visible (2.5 ms) and converges.

No spec number had to be adjusted under a faithful implementation. Every quoted value is reproduced within its stated tolerance.

## Open questions for the lead

1. **§F "ERP floor on the link" is not implemented.** No value or rule is given, and links have no refractoriness in this model. A proposal: an incompletely lesioned link refuses a launch within F ms of its previous traversal and emits conduction_canceled with cause lesion at position 0. That needs F and a wire decision.
2. **Tone sign.** Positive tone currently lengthens the sinus cycle and increases nodal decrement, mirroring breath. Should positive mean sympathetic?
3. **train_completed after cancel.** Following the spec, cancel emits nothing, so `delivered` always equals `count`. Should a cancel instead emit train_completed with a partial `delivered`?
4. **Breath toggle.** The gesture map says Breath toggles the world's `autonomic`. There is no runtime command, so toggling needs a fresh run. If 12c wants a live toggle, it needs a new command.
5. **Default tissue.** Untagged 1.1.0 sites are atrial, so Stillness shortens their ERP. Study worlds (12a, 13a–g) should tag tissue on every site.
6. **dist.** `npm run build` succeeds and the bundled engine runs 1.1.0. Restitution ERPs from the bundle matched the laws. The rebuilt `dist/counterpoint.html` was not committed, so `RELEASE.sha256` still verifies the v0.1 artifact. The v0.2 artifact belongs to 15d.

## Notes for the G1 reviewer

The restitution floor (erpMinMs) is not given in the spec's worked example. The fixture uses 50 ms, and it is never reached. diastolicIntervalMs is emitted on every 1.1.0 activation, not only at restitution sites. The Lab's restitution and conduction plots need these "dots" for every site. delayParts adds agentMs, for Slow the current. The five parts always sum to arrival − departure. Rounding is part of the contract: one Math.round per law (README "Laws"). The tests repeat it exactly.
