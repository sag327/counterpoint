# G1 independent review of contract 1.1.0 (tickets 11a–11d)

**Verdict: PASS.** No engine change was needed. Branch `study-2-g1review` is the implementer's commit 568be79 on top of `study-2` at 806459d. Engine code is untouched. This review adds only the three scripts in `tests/review/` and this receipt. Nothing below it was taken from the implementer's tests. I built the worlds again from the spec and wrote the hand recurrences directly from the spec formulas. The engine was run only to fill the "engine" column. G1 can advance once the lead rules on the open questions in the last section. None of them blocks 12a–12d, but questions 2, 3 and 4 should be settled before the 1.1.0 schemas are frozen.

Reproduce from the project root (Node 22, Python 3 with jsonschema):

```sh
node tests/review/g1-v1-invariance.mjs   # check 1: v1 invariance, differential against the 806459d engine
node tests/review/g1-independent.mjs     # check 2: oracles re-derived by hand (exit 1 on any mismatch)
node tests/review/g1-edges.mjs           # checks 3 and 5: semantics, validation, edge cases, readAt/determinism fuzz (about 1 min)
npm test                                 # 87/87 pass
python3 tests/check_contract.py          # passes
```

## 1. v1 invariance

| Check | Result |
| --- | --- |
| `git diff 806459d..568be79`: the 1.0.0 schemas, noteIntent, `tests/fixtures/`, `src/worlds`, `src/{music,runtime,ui,visuals}`, `dist`, `RELEASE.sha256`, both committed evidence files, the existing tests, scenes and evidence generators | No change (22 paths). The only edit to an existing test file is an appended 1.1.0 section in `tests/check_contract.py`. |
| Fixtures A, B and C on `ring.json` | Equal by value to the hand-authored presentations (25, 79 and 89 events). The old and new engines produce byte-identical streams. `circulationWorld` deep-equals `ring.json`. |
| `evidence/engine-01.json`, `evidence/worlds-01.json` | Each regenerates byte for byte from the new engine (517,580 and 213,205 bytes). |
| The 21 evidence scenes re-run as contractVersion 1.1.0 worlds | Identical once `diastolicIntervalMs`, `delayParts` and `cause` are removed. |
| Seeded differential fuzz: the 806459d engine is extracted with `git show` and compared with the current one | 400 random 1.0.0 worlds (automaticity, decrement, disabled directions, half-tick delays) and random v1 commands under irregular advancement. Every event, every rejection message, the diagnostics and 3 readAt snapshots per step are byte-identical (33,802 events). |

## 2. Oracles re-derived independently (`tests/review/g1-independent.mjs`)

| Oracle | Spec | Independent derivation | Engine |
| --- | --- | --- | --- |
| §A CL 340 (E 300, A 200, τ 60) | Stable, ≈253 ms, slope ≈0.78 | Bisection fixed point 253.048 ms, slope 0.783. The tick iteration converges to 253.048. | Identical on all 64 beats. `diastolicIntervalMs` = t − previous refractoryUntil. |
| §A CL 300 | Alternans, ≈233 ms, slope ≈1.1 | Fixed point 233.727 ms, slope 1.105 > 1. The iteration settles at 285.242 / 143.610. | Identical on all 64 beats, no blocked pulse |
| §C overdrive, 30 × 500 ms into an 800 ms focus | 1250, 1070, 962, 897 (±1 tick) | 1250, 1070, 962, **897.2** | 1250, 1070, 962, 897.2 |
| §C pause, non-reset focus (CL 800, ERP 400, PVC at 450) | 2 × cycle | 1600 | 1600 |
| §C pause, reset focus | Cycle + coupling | 1250 | 1250 |
| §B entry ring, 8 × 35 ms, one-way (implementer's parameters) | Variation, < 5 ms after lap 3 | Laps 287.358, 317.656, 308.845, 310.059 … 310.032. Max lap-to-lap change after lap 3: 0.12 ms. | R0 times identical to the recurrence. delayParts sum to the travel time. |
| §B entry ring, 10 × 28 ms, entry 30/50, restitution 230/80/60 (reviewer's parameters) | Same | Laps 291.036, 331.673, 319.949 … 320.325. Max change after lap 3: 1.07 ms. | Identical |
| §B resetting curve (S2 at R0, 5 ms steps) | Monotonic | The no-entry control is flat at 8 × 35 = 280 ms | 20 couplings, 305 → 210 ms. Return rises strictly from 311.723 to 365.409 ms. |
| §D sweep, Duality 720/1030, a = 0–0.25 in 0.0005 steps over 420 A cycles | 2:3 for .155–.205, a narrow 5:7 near .1825, 3:4 for .21–.22 | My own event-level iteration with the in-cycle φ rule: 2:3 .155–.182, 5:7 at .1825, 2:3 .183–.1835, 5:7 .184–.1845, 2:3 .185–.2075, 3:4 .208–.222, **2:3 again .2225–.238**. Uncoupled 0.700. | B firing times identical to the iteration at all 61 amplitudes tested (0.005 grid plus window edges) |
| §D variant with a periodic sine (φ mod 1), hand only | – | No 5:7 window. 2:3 .1515–.2075, 3:4 .208–.221, 2:3 .2215–.25. | Not run |
| §E 3-site nodal chain, CL 300 | 4:3 with progressive prolongation | CCCx repeating. AH 179.423 → 210.027 → 230.667, then a concealed block at N3. Increments shrink (30.6, 20.6). | AH sequence identical. 6 N3 blocks. |
| §E same chain without entry slowing, CL 240–420 (hand only) | Spec: "from decrement alone" | Steady AH takes one value at every cycle length. Only 1:1 or 2:1 occurs. | Not run |
| §E same chain at 320 / 280 | Receipt: 1:1 / 3:2 | CCCC / CxC | 40/40 at 320 |
| §F complete ablation of L5 during reentry | Terminates on the first lap after p = 1 | R0 at 2160, 2642.813, 3148.126, 3698.439. Last capture R6 at 3818.439. The transit is cancelled at 4000. Step delays are 62.813 … 240. | Identical, including every step's `parameter_changed` |
| §F completeness 0.5 | Longer cycle | Steady lap 7·60 + 60·1.75 = 525 | 525, with R0 identical to the recurrence |
| Echo, v0.1 tuning (fast pathway 300, slow pathway 160, H 250, no restitution or entry), drive 600 | AH 110 at 300, ≈288 at 296 (+178) | Closed form. Fast: AH = 80 + 30·e^(−(S2−300)/100) for S2 ≥ 300. Slow: AH = 250 + 60·e^(−(S2−240)/120) below 300. Values at S2 = 310/300/299/296/290: 107.145, 110, 286.696, 287.625, 289.554. Jump +177.625. | Identical on 1.0.0 and as 1.1.0 |
| Conduction paced from A (sinus off), 600 → 280 ms in 10 ms steps | 1:1 | Hand recurrence: 1:1 at every cycle | H and V times identical at all 33 cycles |
| Stillness, dose 1 | Nodal +600e, atrial ×(1−0.2e), sinus ×(1+0.5e), steps every 100 ms | Peaks of 900, 160 and 1200. Every step value written out from the envelope. | Every `parameter_changed` identical. His–Purkinje untouched. Sinus beats follow the law. |
| Slow, dose 1.5 | delay × (1 + 0.3·dose·(1 + max(0, (400 − CL)/400))) | Link PQ 98, 116, 125, 116. The nodal link stays at 80. | Identical |
| Schema | Actual output validates | 11,760 events from this script, plus 123,640 from the probes and fuzz in g1-edges | All valid under event.v1_1 |

## 3. Semantics review

- **Ordering within one instant (6 rules).** Rule 1: edits and the derived lesion and agent steps take their command's submission position in the EDIT phase, before collisions. Rule 2: train pulses and `stimulate` commands share the STIMULUS phase in submission order. The spec does not order single stimuli against pulses, so this is an acceptable completion. Rule 3: §A uses priorUntil from before the capture. Rule 4: all outcomes are settled before any launch. I probed this: B, captured in the launching batch, slows the A→B launch by 40·e^(−20/50). Rule 5: plan resets, then modulate, then commit. I probed a reset and modulation in the same tick: φ = 0, shift 0, next = t + T. Rule 6: suppression changes at outcome time, and every schedule uses T + S. All correct.
- **Determinism.** `src/engine` has no `Math.random`, `Date` or `performance`. Iteration orders are id-sorted. The 1.1.0 fuzz (150 random worlds with every new command) gives identical events under 37 ms steps, three coarse steps and a 50-batch history.
- **Validation.** 30 malformed commands and 13 malformed worlds are all rejected (ranges, types, extra keys, unknown targets, start before tMs, count and cycle limits, label length). A 1.0.0 run rejects all nine new commands. A rejected train does not use up its commandId.
- **Train budget.** At most 64 pulses, cycles of at least 150 ms, and admission judged only from earlier commands. The 5th overlapping train is rejected, and a cancel frees its slot. Every pulse is charged: a 64-pulse train under budget 100 faults with PROCESSING_BUDGET.
- **Stillness and Slow** follow the spec formulas exactly (table above). The implementer's two additions, dose scaling of e and an agent part on lesioned delay, are consistent with the spec.
- **Lesion steps** fall every 250 ms of sim time, with the last step exactly at durationMs. Delays are round(delay × (1 + 3p²)). The final step cancels transits with cause lesion.
- **readAt and history.** In the fuzz, readAt(t) taken after the fact equals the snapshot read live at t for 20,831 instants. This covers lesion progress, restitution laws, suppressionMs, entry and Stillness ERP, across checkpoints and after history eviction.

## Findings by severity

No Critical or High findings. Nothing blocks G1.

**Medium**

- **M1. A complete lesion can be reopened and then never re-ablated.** `setLinkEnabled(true)` re-enables a link at lesion progress 1. It then conducts at 4× delay. A further `ablate { completeness: 1 }` is a silent no-op, because completeness ≤ the current target. Ablating an already-disabled link emits no `link_changed` when it completes. No current consumer mixes the two, so this is latent. Recommendation: reject `setLinkEnabled(true)` on a link with lesion progress 1, which makes complete lesions permanent until reset ("Reset restores the study"). Alternatively, keep a separate `lesionModel: 'instant'` world flag as the spec suggests. This is a semantic choice, so I did not change the engine.

**Low**

- **L1. Overdrive's fourth return is 897.2 ms, not "897 (±1 tick)".** The law gives S = 0.6³ × 450 = 97.2 ms exactly. The spec number is rounded and should read 897.2. The receipt's claim that "no spec number had to be adjusted" is off by this one value.
- **L2. `setNodeERP` under restitution cannot be undone.** The 1 ms floor on erpMin loses the offset: 300 → 100 → 300 leaves erpMin at 201 instead of 50. Edits are logged, so replay is unaffected. Fix if wanted: clamp erpMin at use time and keep the unclamped offset.
- **L3. `setRestitution` changes erpMax, and so readAt `erpMs`, but emits only `parameter_changed` restitution.** Consumers that follow erpMs from events need to watch both. Document it, or also emit erpMs.
- **L4. A protected focus whose automaticity is set to null can never be captured again.** Every arrival is blocked with cause protected. Either clear protection when the cycle goes null or document it.
- **L5. README says delayParts "sum exactly" to arrival − departure.** That holds in integer ticks. About 47% of launches differ by float rounding when summed in ms. Say "in ticks".
- **L6. A world that declares contractVersion "1.0.0" is rejected.** world.v1 forbids the key anyway, so this is harmless, but either accept "1.0.0" as an explicit 1.0.0 marker or document the rejection.
- **L7. `maxConcurrentTrains` is an engine option.** A performance replayed under a different option could be admitted differently. Make 4 a contract constant like 64 and 150, or record it in the performance file (15c).

## Spec corrections (implementer's five)

1. **§D above 0.22: agree.** My iteration finds 2:3 again for a = 0.2225–0.238 under the in-cycle rule, and from 0.2215 under a periodic sine. With Δφ = a·sin 2πφ the circle map stops being invertible at a = 1/2π ≈ 0.159, so tongues overlapping and returning is expected. The spec and Hemiola text should say: 3:4 for 0.208–0.222, 2:3 returns, irregular from about 0.2385.
2. **§D phase domain: agree.** The spec formula, read literally, is periodic. Only the in-cycle rule (φ outside [0, 1) ignored) reproduces the narrow 5:7 window. My periodic variant has none. The spec must state the domain. This is the one place where my iteration follows the implementer rather than the spec text, and I checked both variants.
3. **§E wording: agree.** In a feed-forward chain at a constant drive cycle, each site's capture interval equals the cycle. Source recovery is therefore constant, and so is the decrement. By induction no delay can grow beat by beat. My no-entry control finds only 1:1 or 2:1 between 240 and 420 ms. Wenckebach needs §B entry slowing, which is a v1.1 rule. "No new engine rule" in §E should read "no rule beyond §A–§B". Meter (13b) must put entry slowing on its chain.
4. **Echo jump location: agree.** In closed form the fast pathway blocks exactly when S2 < 300 ms (FP recovers at drive + 310). At 1 ms resolution the jump is therefore 300 → 299 (+176.7). "296" is the 4 ms grid of ahcurve.mjs. The values at 300 and 296 hold.
5. **§B oracle strength: agree.** With 60 ms links the lap variation is negligible. Both rings I used, including one of my own, show visible variation that converges well inside 5 ms. Suggestion: state the oracle as convergence to the §A + §B fixed point within 1 ms by lap 8, rather than only "< 5 ms".

## Decisions (DECISIONS.md, all 11 rows)

| Decision | Verdict |
| --- | --- |
| New `*.v1_1` superset schemas. Version inferred from contractVersion or any 1.1.0 field. | Agree. Producers should still write contractVersion, since a stray `audible` silently promotes a world to 1.1.0. |
| A 1.0.0 run rejects the 1.1.0 commands, and annotations appear only on 1.1.0 runs | Agree. This is what keeps 1.0.0 streams valid under the 1.0.0 schema (verified by fuzz). |
| §D inputs outside [0, 1) ignored. Phase origin before the first attempt is firstAttempt − cycle. | Agree, verified independently (above) |
| `shiftMs` is Δ before the t + 1 tick floor. Amplitude 0 emits nothing. | Agree. The Lab's dots then lie on the sine law. |
| `delayParts.agentMs` | Agree. It is additive, and folding Slow into baseMs would hide it from the conduction curve. |
| setTone sign | See open question 2 |
| Restitution requires erpMax = erpMs. readAt reports the rested ERP. | Agree. It removes a two-ERP ambiguity. See L2 and L3. |
| Lesions monotone. A deeper pass continues from current progress. Floor deferred. | Agree with the monotone and continue semantics (probed). See M1 for how it interacts with setLinkEnabled. |
| Stillness overlaps take the strongest envelope. A new Slow dose ramps from the current level. | Agree. Both are deterministic and bounded (probed). |
| Train admission from earlier commands only, cap 4, every pulse charged | Agree. Admission must not depend on the horizon. See L7. |
| No rebuilt dist on this branch | Agree. RELEASE.sha256 still pins v0.1, and dist belongs to 15d. |

## Recommendations on the open questions

1. **Lesion "ERP floor on the link".** Remove it from v1.1 by spec amendment. No oracle needs it, links have no refractoriness in this graph, and the incomplete-lesion behaviour the spec asks for (a slower circuit that persists) already emerges. Revisit in 13c (Ostinato) only if a rate-dependent gap is wanted. If so, model it as a silent `audible: false` gap site whose ERP the lesion raises, in the spirit of §E. That avoids a new link-refractory rule and a new wire field.
2. **Tone sign.** Positive should mean sympathetic: cycle × (1 − 0.2v) and nodal decrement × (1 − 0.5v). Keep both factors moving together, as now, because that coupling is physiological. Only flip the sign. An EP reads "more tone" on a slider toward faster rate as adrenergic. Breath's sign stays free, since it is a sine. Decide this before freezing.
3. **cancelTrain and train_completed.** Emit `train_completed { commandId, delivered: k }` in the cancel batch when a train that has not finished is cancelled, including `delivered: 0`. As specified, `delivered` always equals `count` and carries nothing. The gesture layer ("Hold a tempo" release, Rest) and the entrainment detector (13h) need one event that closes a train and says which pulse was last. The event shape is unchanged, so this is a small amendment, but it must land before freeze.
4. **Live Breath toggle.** Add a command before freeze, for example `setAutonomic { value: { breathPeriodMs, depth, targets } | null }`, emitting `parameter_changed` with parameter autonomic and applied prospectively at scheduling. The breath phase should stay anchored to absolute sim time so toggling never resets it. Without the command, the gesture map's Breath toggle cannot replay from the command log.
5. **Default tissue.** Keep `'atrial'` as the spec states. Add a lint test in 12a and 13a–g: every site of a shipped study world declares `tissue`. That way Stillness never quietly shortens the ERP of an untagged nodal or ventricular site.
