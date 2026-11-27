# Contract 1.1.0 amendments receipt for 11e

**Attempt 02, ready for lead review before the 1.1.0 freeze.** Branch `study-2-11e`, based on `study-2` at 43aeef2 (contract 1.1.0 plus its passing G1 review). This run implements the lead's decisions on the review's open questions and findings. Contract 1.1.0 was not frozen, so its wire shapes change in place. Every 1.0.0 behaviour is unchanged. Node v22, Python 3 with `jsonschema`. Reproduce from the project root:

```sh
npm test                                   # 109 tests: 97 from 43aeef2 (9 updated to the new semantics or titles) plus 12 in describe "11e"
python3 tests/check_contract.py            # 1.0.0 fixtures, 1.1.0 schemas, evidence/engine-v11-02.json
node tests/engine-v11-evidence.js > evidence/engine-v11-02.json
node tests/review/g1-v1-invariance.mjs     # PASS: differential against the 806459d engine
node tests/review/g1-independent.mjs       # PASS: exit 0
```

## Changes

| Item | Change | Regression test (tests/engine-v11.test.js, describe "11e") |
| --- | --- | --- |
| 1. Tone sign | Positive is sympathetic: sinus cycle × (1 − 0.2v), nodal decrement × (1 − 0.5v). Only the sign flipped. | 11e-1, for v = ±0.5 and ±1. The cycle and decrement are checked against the law. V11-C setTone was updated to the new sign: +1 gives 640 ms cycles. |
| 2. Cancel closes a train | `train_completed { commandId, trainId, delivered, count, cancelled }`. The train's commandId is in both commandId and trainId. A cancel of an open train emits it in the cancel batch with the partial count, which can be 0. Natural completion has `cancelled: false`. A finished or already cancelled train emits nothing on cancel. Within a batch, cancellations close before completions. | 11e-2 covers mid-train, before start (0), at the last pulse's instant, after completion, twice, and in the same batch as a completion. V11-T cancel and V11-O2 were updated. |
| 3. Live Breath | `setAutonomic { value: { breathPeriodMs, depth, targets } \| null }` emits `parameter_changed` (autonomic). Targets are given in canonical order, and an equal value is a no-op. It applies prospectively. The breath phase is sin(2πt/P) of absolute sim time. | 11e-3: RR follows an on/off recurrence keyed to absolute t. The result is identical under 100 ms steps. The test also covers validation and rejection on a 1.0.0 run. |
| 4. Lesions | `setLinkEnabled(true)` is rejected at enqueue once the log shows the line complete at that instant. The rule uses the first completeness-1 ablate by time and then submission order, with start + duration ≤ tMs. If enqueue order hid the conflict, the enable is a no-op at apply time. Ablating a disabled link records lesion state and emits the steps and lesion_changed, but no link_changed. "ERP floor on the link" is removed from the spec, README and DECISIONS. | 11e-4, two tests: rejection at and after completion, an earlier enable accepted, reset reopening the line, the out-of-order no-op, the disabled-link lesion, and re-enabling an incomplete lesion (lesionMs 75). |
| 5. L2 | Under restitution the floor is stored as `floorOffset` below erpMax and clamped to 1 ms only in use. 300 → 100 → 300 restores erpMin 50. | 11e-5 L2: at erpMax 100, erpMin reads 1 and the capture uses ERP 1. |
| L3 | A setRestitution that moves the rested ERP emits `parameter_changed` restitution, then erpMs, with the same commandId. | 11e-5 L3. V11-A restitution edits now expects the third event. |
| L4 | Chosen behaviour: setAutomaticity null lifts protection and emits `parameter_changed { parameter: 'protected', nodeId, previous: true, value: false }`. Restoring the cycle does not re-protect. | 11e-5 L4: conduction then captures P. |
| L5 | README: delayParts sum exactly in ticks. Summed as ms they may differ by rounding. | Documentation only. V11-Z already checks the tick sum. |
| L6 | contractVersion "1.0.0" declares a 1.0.0 world. It runs byte-identically to the same world without the key. It is rejected if it carries any 1.1.0 field. world.v1_1 accepts the value. | 11e-5 L6: fixture A matches byte for byte, and the test checks the 1.0.0 snapshot shape and both rejections. |
| L7 | `limits.maxConcurrentTrains` is an integer from 1 to 16, default 4, and it marks a world as 1.1.0. The engine option (default now 16) is only a host cap. Reset refuses a 1.1.0 world whose limit exceeds it. | 11e-5 L7. V11-T cap now uses `limits: { maxConcurrentTrains: 2 }` instead of the engine option. |
| 6. Lint | `lintStudyWorld(world)` is exported from src/engine/input.js. It returns a frozen array with one `{ code: 'MISSING_TISSUE', nodeId, message }` per site without its own `tissue` key. | 11e-6 |
| 7. Spec number | §C and its oracle now read 897.2 ms (exact). | 11e-7 asserts the returns with no tolerance: 1,250,000, 1,070,000, 962,000 and 897,200 ticks. |

Schemas changed in `contracts/*.v1_1.schema.json`:
- **World:** contractVersion is an enum of "1.0.0" and "1.1.0", and the new `limits` object is added.
- **Command:** `setAutonomic` is added, bringing the 1.1.0 commands to ten.
- **Event:** train_completed adds trainId, count and cancelled, and delivered may be 0. parameter_changed gains `autonomic` and `protected`.

The 1.0.0 schema files are untouched. README ("Counterpoint contract 1.1.0"), DECISIONS.md (new 11e table, with three superseded rows annotated) and design/study-2-spec.md (§C, §F, §G, oracles and the gesture map) are updated.

## Evidence

`evidence/engine-v11-02.json` comes from the updated generator. It holds the 18 traces of attempt 01, re-run under the new semantics (tone and trains changed), plus four new traces: `breathToggle`, `cancelPartial`, `unprotect` and `lesionDisabled`. `tests/engine-contract-v11.py` now validates it by default. The validator also checks these points:
- trainId equals commandId, and count matches the train command.
- delivered equals the pulses actually emitted.
- A cancelled train has delivered < count, and a completed one has delivered = count.
- Each train closes at most once.
- Both cancelled and completed closes appear, including one with delivered 0.
- The parameter set includes autonomic and protected.

`evidence/engine-v11-01.json` stays as the record of attempt 01. It no longer validates under the amended event schema.

## v1 invariance

`node tests/review/g1-v1-invariance.mjs` passes every check:
- Fixtures A, B and C match.
- Both committed 1.0.0 evidence files regenerate byte for byte.
- The 21 scenes give identical results as 1.1.0 worlds.
- The seeded 400-world differential fuzz against the 806459d engine gives 33,802 byte-identical events, rejection messages and readAt snapshots.

Every new rule lives on a 1.1.0-only path. Tone, setAutonomic, train closing and lesion closure cannot be reached from a 1.0.0 run, the floor offset needs restitution, and protection needs a 1.1.0 automaticity.

## Deviations and notes for the lead

1. **train_completed carries the train id twice** (`commandId` and `trainId`), as the decision text specified. The cancel's own commandId is not carried. Add it before freeze if the gesture layer needs to link the close to the cancel.
2. **L7 refuses rather than clamps.** The decision said to keep the engine option "only as an upper cap". I read that as: a 1.1.0 world whose limit exceeds the host cap is refused at reset, rather than silently admitting fewer trains. That keeps replays exact or loudly failing. One consequence is that a host configured below 4 must run worlds that declare a lower limit. 1.0.0 worlds are never refused.
3. **The lesion closure is judged from the command log,** like train admission, so live and replayed logs are accepted identically. If the earliest complete ablate was enqueued after an earlier-enqueued one, the rejection can be conservative.
4. **tests/review/g1-edges.mjs is the reviewer's probe of the old semantics, and it was not edited.** It now stops at its M1 probe, because the reopening enable is rejected, which is the intended fix. Run on a scratch copy with that probe guarded, it reports four BUG lines, all of them old expectations that the lead's decisions replace:
   - cancel emits nothing, twice
   - setRestitution emits a single event (L3)
   - setTone −1 gives 640 ms (it is now 960)

   Everything else passes: schema validation of 60,622 events, the readAt fuzz, fine and coarse determinism, and delayParts tick sums. Its L4 note now reports that the stimulus is captured. The reviewer may want to refresh that script at freeze.
5. `node_modules/` is untracked in the worktree and was not committed.
