# Decisions • 2026-11-26

| Decision | Reason / revisit condition |
|---|---|
| Freeze v1.0.0 as JSON Schema plus a prose behavioral contract. | Engine, audio and visuals can use common fixtures without choosing a build tool. The lead versions wire and semantic changes together. |
| Use an inclusive commit horizon with integer microsecond ticks and ms on the wire. | This gives equality at ERP a reproducible meaning across frame sizes. Revisit only with a failing timing example. |
| Parents form a chain through cause, transit and activation IDs. | Node merges retain both parents; revisiting a recovered node remains possible. |
| Keep ring trace fixtures and world under tests. | These files express an independently calculable target. Later tickets supply the production preset and real event evidence. |
| Use the 1000 ms L4 cut and a 1500 ms restore for fixture C. | The former exercises continued travel after the cut. The latter proves restore into silence. Ticket 03b separately cuts at 930 during transit. |

## 2026-11-26 — first implementation checkpoint

Lead: implement the frozen contract in dependency-free JavaScript modules and keep a local named-module build rather than add remote dependencies. Pure engine, mapper, renderer and transport remain separate. Production loads no test fixtures. Ship a single-file P0 candidate and the maintainable sources together. Browser acceptance and actual listening remain open; do not advance P1 based on an assumed artistic verdict.

Rendering retains gold/cool-blue fine filaments, an open center and separate 44px semantic interaction targets. Begin actions sit below the resting sculpture. Palette candidates are Balanced/Open/Suspended Chamber voicings at identical physiological timing.

Retention: UI exports retain 4096 events and report discarded count. Engine keeps bounded snapshot deltas/checkpoints; audio uses bounded voice/buffer/journal storage. Per-run command deduplication identities intentionally persist until reset. Explicit command-log retention details are in the runtime receipt.

Contract clarification, causal sub-tick collision: a newly launched opposing transit may yield a strictly interior crossing that rounds to its launch tick. Existing due collisions retain priority before arrivals; a collision first discovered from a launch at the current instant is resolved after that launch in the same complete timestamp batch. Causality must not be reversed to satisfy a phase ordering that was unknowable before launch. No wire schema, units or frozen fixture changes are required. Engine receipt carries the regression input.

## 2026-11-26 · v0.1 opening, gesture and review

Conduction opens before Begin in a rested state. The engine supplies its first automatic excitation at 0 simulated ms when playback starts. Duality uses independently paced branches with a 170 ms offset for B. Circulation retains its test oracles and its R0 reference protocols. Switching a running world starts a fresh run, and switching while paused leaves the fresh world ready to resume.

A site touch becomes a stimulus on release if the pointer has traveled less than 10 CSS px. A deliberate stroke disables each enabled physical path crossed, in stroke order. The geometric test excludes node approach and tangent contacts. Pointer cancellation ends the gesture, and a cut already submitted remains a normal engine command. Site and connection buttons stay available for keyboard operation.

The creator reported that the playable Circulation study worked well and requested swipe-to-cut. This is the usability review used to advance P1. Chamber Balanced and 4× dilation remain initial defaults pending a fixed-input listening comparison.

## 2026-11-26 · Contract 1.1.0 (Study No. 2 tickets 11a–11d)

Contract engineer decision record, pending lead acceptance at G1. The failing input is the Study No. 2 spec itself: v0.1 has no history dependence, so no maneuver behaves as it does in the lab. Affected consumers are the mapper (audible false, ticket 12d), the Ladder and Lab (delayParts, diastolicIntervalMs, phase_modulated, lesion_changed), and gestures (trains, agents, ablate). No frozen fixture was migrated. All of them stay byte-identical.

| Decision | Reason / revisit condition |
|---|---|
| Ship contract 1.1.0 as new `*.v1_1.schema.json` files, each a strict superset of 1.0.0. A world is 1.1.0 if it has contractVersion "1.1.0" or any 1.1.0 field. contractVersion is optional in the schema. | Lead instruction for 11a. Every 1.0.0 document validates under both schemas, and producers should still write contractVersion. |
| A 1.0.0 run rejects the nine 1.1.0 commands, and the 1.1.0 annotations (diastolicIntervalMs, delayParts, cause) appear only in 1.1.0 runs. | This keeps the invariant that a 1.0.0 stream validates under the 1.0.0 event schema. To use trains on a frozen preset, mark a copy 1.1.0. Its dynamics are unchanged. |
| §D ignores coupling inputs outside the target's current cycle (φ < 0 or φ ≥ 1). Before its first attempt, a focus's phase origin is firstAttempt − cycle. | The spec's prototype (design/plates/src/labplate.py) uses this rule, and only this rule reproduces the narrow 5:7 window near 0.1825. A periodic sine gives no 5:7 window and stays at 2:3 from 0.221 to about 0.245. |
| phase_modulated.shiftMs is the PRC value Δ. nextAttemptMs carries the t + 1 tick floor. Amplitude 0 emits nothing. | The Lab's phase-response dots then lie on the sine law within rounding. |
| delayParts adds agentMs. | Slow the current changes link delay. Folding it into baseMs would hide the agent from the conduction curve. |
| setTone sign: superseded by 11e (positive = sympathetic). | See the 11e table below. |
| Restitution requires erpMaxMs = erpMs. readAt and parameter_changed erpMs report the rested ERP: erpMax plus any agent modifier. | This removes the two-ERP ambiguity. setNodeERP keeps erpMs and erpMax in step. |
| Lesions are monotone. A pass at or below the current target is a no-op. A deeper pass continues from the current progress. | The gesture layer sends cumulative completeness (0.5, then 1). The "ERP floor" question is settled in 11e (removed). |
| Stillness overlaps take the strongest envelope. A new Slow ramp starts from the current level. | Both rules are deterministic, bounded and replay-safe. Stacking doses has no oracle yet. |
| Train admission caps overlapping pulse windows (limit moved into the world by 11e, default 4). The cap uses only earlier commands. Each pulse is charged to the processing budget. | Ticket 11d budget limits. A command log must be accepted the same way live and on replay, so admission can never depend on the horizon. |
| Do not commit a rebuilt dist/counterpoint.html on this branch. | dist is the v0.1 release artifact pinned by RELEASE.sha256. `npm run build` was verified, then restored. The v0.2 artifact belongs to release ticket 15d. |

## 2026-11-26 · Contract 1.1.0 amendments before freeze (ticket 11e)

Lead decisions on the G1 review's open questions and findings (docs/runs/g1-review-01.md), implemented in docs/runs/contract-v11-02.md. Contract 1.1.0 is still unfrozen, so its wire shapes change in place; every 1.0.0 behaviour stays byte-identical (tests/review/g1-v1-invariance.mjs passes).

| Decision | Reason / revisit condition |
|---|---|
| Tone sign: positive `setTone` is sympathetic. Sinus cycle × (1 − 0.2v), nodal decrement × (1 − 0.5v); negative is vagal. Only the sign changed. | An EP reads "more tone" toward a faster rate as adrenergic. Both factors keep moving together. |
| `cancelTrain` closes an open train in the cancel batch with `train_completed { commandId, trainId, delivered, count, cancelled: true }`; delivered may be 0. Natural completion has `cancelled: false`. A train closes exactly once. | Gestures (Hold a tempo, Rest) and the entrainment detector (13h) need one event that closes a train and says which pulse was last. |
| New command `setAutonomic { value: autonomic | null }` for the live Breath toggle, emitting `parameter_changed` (autonomic). The breath phase is tied to absolute sim time. | Without it the gesture map's Breath toggle could not replay from the command log. |
| A complete lesion stays closed until reset: `setLinkEnabled(true)` is rejected at enqueue once the log shows p = 1 by that instant (no-op at apply time if enqueue order hid it). Ablating a disabled link records lesion state and emits lesion_changed, with no link_changed at completion. | Fixes review M1 ("Reset restores the study"). Judged from the log only, so live and replay agree. |
| The §F "ERP floor on the link" is removed from contract 1.1.0 and from the spec semantics. | No value or rule, no link refractoriness in the model, no oracle needs it. Revisit in 13c only as an `audible: false` gap site. |
| L2: under restitution erpMin is stored as an offset below erpMax and clamped to 1 ms only in use. L3: setRestitution that moves the rested ERP also emits parameter_changed erpMs. L4: setAutomaticity null lifts `protected` and emits parameter_changed (protected); restoring the cycle does not re-protect. | Review low findings; L4 chose "becomes unprotected". |
| L5: delayParts sum exactly in ticks; ms sums may differ by rounding (README). L6: contractVersion "1.0.0" is accepted as an explicit 1.0.0 world and must not carry 1.1.0 fields. | Review low findings. |
| L7: `limits.maxConcurrentTrains` (1–16, default 4) is a world field. The engine option (default 16) is only a host cap, and reset refuses a 1.1.0 world whose limit exceeds it instead of silently admitting fewer trains. | Replays are self-describing. A refusal is louder than a divergent replay. Revisit if a host needs a lower cap for default worlds. |
| `lintStudyWorld(world)` (src/engine/input.js) reports every site without explicit tissue. Default tissue stays atrial. | Review recommendation 5; study tests 12a and 13a–13g assert an empty result. |
| Spec §C numbers: the overdrive accelerando is 1250, 1070, 962 and 897.2 ms exactly. | Review L1. 0.6³ × 450 = 97.2 ms. |

## 2026-11-27 · creator revisions for an EP audience

The creator found the music analogy too strong for electrophysiologists. The sound stays. Musical subtitles, chips, glossary cards and pitch names are hidden behind `SHOW_MUSIC_LABELS`, and the Staves view is hidden. Both remain in source for a possible return. Duality is withdrawn from the menu, but its world and fixtures stay. Playback runs at 1/4 to 1/12 of real time and is labelled as a fraction and a percentage. Readouts are EP-relative: intervals and time remaining, never the run clock. Conduction and Circulation remain the introductory pair, and Network stays the default view. Next: live curves built while pacing and high-level tunable parameters. Primary users are EP fellows and attendings.

## 2026-11-27 · second creator review: simplify

Cutting connections is removed from the app: it added complexity with little teaching value. The engine command stays for replays and future studies. Volume and mute are removed in favour of the device's own controls, and the S shortcut for Stillness is removed. Playback speed shows fractions only. Instructions are one short, readable line above the controls, and the selected site is highlighted on the map. Echo loses its header so all three worlds share one layout. Still to do: guided runs start from a preconditioned state just before the last S1 (M5); the inspector card leads with key readouts and moves detail into expandable sections; and inspect and tune work in every world (M6).

## 2026-11-27 · Laboratory hidden; inspector curves reset on edit

The Laboratory does not earn its place yet, so it is hidden behind `SHOW_LABORATORY` and its code is kept. When the player edits an element's curve in the inspector, that element's earlier data points are erased, because they no longer describe the model. The data points are drawn larger and brighter.

## 2026-11-27 · no Stillness; guided runs show the behaviour in one press

Stillness is removed from every world; the engine keeps the contract command, unused. Find the echo and Find the arrhythmia (formerly Find the circuit) now reset the model to nominal and precondition it with the drive already given. The next impulse, a single S2 in the middle of its window (252 ms for one echo, 282 ms for sustained reentry), produces the behaviour at once, with no stepping between presses.

## 2026-11-27 · Circulation-only shareable edition

The creator wants to share Circulation before the other models are ready. A build-time edition (`src/ui/edition.js`) produces a separate page with Circulation alone, the Network view only (no Ladder) and the sound fixed to Chamber / balanced, with no palette controls. It is published at `/circulation/` and nothing links to it. The full app is unchanged; one source serves both.
