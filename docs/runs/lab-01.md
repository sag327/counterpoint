# Lab receipt 01: tickets 14d, 14e and 14f

Branch `study-2-lab`. It is based on `study-2` at 43aeef2 and has `study-2` merged at 82535e3, which brings in contract 1.1.0 with 11e and the views. Everything lives in `src/lab/**`, `tests/lab-*` and this receipt. Nothing in the engine, contracts, worlds, visuals, music, runtime or `src/ui/app.js` changed. Integration is a later ticket; see the integration notes below.

```sh
npm test                                            # 157 pass (25 in tests/lab-*.test.js)
node tests/lab-plots.test.js docs/runs              # re-renders lab-01-plate6/plate4/protocols.png
python3 tests/lab-browser.py docs/runs/lab-01-card.png   # Chromium: keyboard + pointer handles, screenshot
```

## Files

| File | Ticket | What it is |
| --- | --- | --- |
| `src/lab/measure.js` | 14e | Pure detection functions over event arrays and protocol rows |
| `src/lab/protocols.js` | 14e | `runProtocol`, `runProtocolSync`, `protocolCsv`, six protocols |
| `src/lab/worker.js` | 14e | Web Worker wrapper (`createProtocolRunner`) with a chunked main-thread fallback |
| `src/lab/plots.js` | 14f | Canvas 2D plot catalog. Each entry has `build`, `draw`, `table` and `summary` |
| `src/lab/inspector-card.js` | 14d | Site and link card: parameter state, commands, DOM component |
| `src/lab/lab.css` | 14d | Card styles (plate palette) |
| `tests/lab-measure.test.js`, `lab-protocols.test.js`, `lab-plots.test.js`, `lab-card.test.js` | all | 25 tests |
| `tests/lab-worlds.js` | test data | The Echo plate world (echo.mjs: fp 300, sl 160, H 250) and the spec's Echo table as a 1.1.0 world. These are test worlds, not study presets. |
| `tests/lab-browser.html`, `tests/lab-browser.py` | 14d | Real-browser harness for the card (not part of `npm test`) |

## Oracles

| Oracle (spec) | Result |
| --- | --- |
| The S1–S2 runner on Echo (drive 600 ms × 8 from CSp, S2 from 440 down to 200 in 4 ms steps as in plate 6) gives a jump at the first S2 below 300 of about +178 ms, a fast-pathway ERP of 296–300, slow-pathway block at 232–236 and an atrial ERP of 228–232 | Jump 300 → **296**, **+177.6 ms** (AH 110 → 287.6). FP ERP **296** (upper bound 300). SP ERP **236**. AV-nodal conduction ERP **236**. Atrial (CSp) ERP **228** (upper bound 232). FRP 328.5 ms. Test: `lab-protocols` 1. |
| The same at 1 ms steps | FP **299**, SP **239**, CSp **229**, jump at 299 (+176.696 ms, the G1 closed form). Test: `lab-protocols` 2. |
| Engine dots lie on the law curves within 1 tick | §A: every capture at CL 340 and 300 (alternans included). Decrement and §B entry: every launch on every Echo 1.1.0 link and on the §B ring. §D: every `phase_modulated` event at a = 0, 0.17 and 0.215. Tests: `lab-measure` 7, 8 and 9. In the card, dots from before the last edit of that element are drawn faint and left out of the "on the curve" count (screenshot: "4 of 4 … 8 earlier captures used other parameters"). |
| Handle edits produce commands that replay identically | Keyboard ±1 and ±10 ms, a pointer drag and a number field are enqueued through the host. Replaying the command log into a fresh engine gives `deepEqual` events. Study default restores the preset and clears the modified marks. Test: `lab-card` 2. Chromium: `lab-browser.py`. |
| Further checks | §E chain incremental pacing: 1:1 down to 320, then 5:4 at 310 (Wenckebach cycle 310), 4:3 at 300 with AH 179.5 → 210.1 → 230.7, 3:2, then 2:1 fixed at 260 and below. Coupling sweep: 2:3 at 0.155–0.18 and 0.185–0.2075, 3:4 at 0.21–0.22, 2:3 again at 0.2225–0.2375 (matches G1). Ring entrainment: PPI − TCL = 0 in the circuit and 120 at a 60 ms bystander. §B ring resetting curve rises monotonically. |

**Spec note (oracle range).** "Slow-pathway block 232–236" holds only on the plate's 4 ms grid. The rule "longest coupling that fails" is grid-dependent, and the true threshold is S2 < 240 (SP ERP 240 measured from the S1 capture at A1 + 50, reached at A2 + 50). At 1 ms the result is 239, outside the stated range. Suggest restating every ERP oracle as an interval [erp, erp + step], which is what the runner reports (`erpMs`, `upperMs`, `resolutionMs`). The slow-pathway range then becomes 236–240.

## API

### measure.js (pure)

- **Laws in ms, with the engine's tick rounding:** `restitutionErp(law, di)`, `restitutionSlope`, `decrementExtra(law, recovery)`, `entryExtra(law, slack)`, `phaseShift(T, a, φ)`.
- **Causality:** `descendantsOf(events, rootIds)` (one pass: activation/block → causeIds, launch → activationId, arrival → launch). Also `firstDescendant`, `descendantActivations` and `siteIntervals(events, from, to)` for AH/HV-style intervals measured causally, so they are never confused with an unrelated sinus beat.
- **Rules:**
  - `effectiveRefractoryPeriod(points)` gives `{erpMs, resolutionMs, upperMs}`.
  - `functionalRefractoryPeriod`.
  - `detectJumps(points, {minJumpMs: 50, maxStepMs: 10})`.
  - `conductionPattern(beats)` gives `{kind: '1:1'|'wenckebach'|'fixed'|'none'|'irregular', ratio: '4:3', …}`.
  - `wenckebachCycle(rows)`.
- **Entrainment and cadence:**
  - `tachycardiaCycle(times, before, 5)` (median), `postPacingInterval`, `pacedCapture` (3 cycles ±1 tick).
  - `activationOrder` and `sameCyclicOrder`.
  - `entrainmentResult(...)` gives `{tclMs, captured, sameOrder, ppiMs, ppiMinusTclMs}`.
  - `classifyCadence(events, {chambers, lastPacedMs})` gives `VAV | VAAV | other`.
  - `lockingRatio(events, driver, driven, window)` and `simpleFraction`.
- **Dots:** `restitutionDots`, `erpSequence`, `conductionDots(events, linkId, fromNodeId)` (recovery, slack, parts, total), `phaseDots`, `returnPairs`, `intervals`.

### protocols.js

`runProtocolSync(world, protocol, {onProgress, engineOptions})` and `runProtocol(...)` (a Promise that yields every `sliceMs` and takes an AbortSignal `signal`) return `{protocol, worldId, columns, rows, summary, text}`. `protocolCsv(result)` exports CSV. Rows are plain JSON, so they can go in the performance file.

| type | inputs | summary |
| --- | --- | --- |
| `s1s2` | `siteId, driveCycleMs, driveCount=8, s2 (range or number), s3? (range or number), sites {atrium, his, ventricle}, labels, erpSites?, tailMs=1500` | `erps[site]`, `conductionErp`, `frp`, `jump`, `echoCouplingsMs`, `sustainedCouplingsMs` |
| `incremental` | `siteId, outputId, cycles range, beats=24` | `blockCycle`, `wenckebachCycleMs` |
| `burst` | `siteId, cycleMs or cycles[], count, observeId` | `sustainedCyclesMs`. Only beats causally descended from the burst count, so a sinus rhythm that simply continues is not counted as sustained. |
| `resetting` | `siteId, induction[commands], settleMs=3000, couplings range` | `tclMs`, `terminationWindowMs` |
| `entrainment` | `candidates[], induction, offsetMs=20, count=12, circuitIds?` | `inCircuit` (\|PPI − TCL\| ≤ 20 and captured) |
| `couplingSweep` | `couplingId, from/to/step or values[], cycles=420, warmupCycles=20` | `plateaus` |

Every step builds a fresh `Engine` from the world it is given, with a fixed run ID such as `lab-s1s2-<i>`. Each step advances in 1000 ms chunks under the default processing budget. A fault becomes `row.fault` and does not throw. On 1.1.0 worlds, pacing uses one `stimulateTrain` per drive (cycle ≥ 150 ms, count ≤ 64). Otherwise it uses single stimuli with identical trigger IDs (`S1#k`), so analysis never needs to know which was used. The runner never cancels trains, so the 11e `train_completed`-on-cancel change does not affect it. The Echo S1–S2 scan (61 runs) takes about 0.2 s in Node.

### worker.js

`createProtocolRunner({workerUrl, WorkerClass, forceMainThread})` gives `{mode, run(world, protocol, {onProgress, signal}), terminate()}`. Inside a worker the module installs its message handler itself (`{id, type: 'run'|'cancel'}` → `progress | result | error`). If the Worker cannot be constructed or reports a load error, runs fall back to `runProtocol` on the main thread.

### plots.js

`PLOT_CATALOG[id]` is `{build(input) → model, draw(ctx, model, rect, {activeHandle}), table(model), summary(model)}`. The ids are `restitution`, `cobweb`, `conduction`, `s1s2Conduction`, `s1s2Output`, `incremental`, `resetting`, `entrainment`, `phaseResponse`, `staircase` and `returnPlot`. Supporting exports:

- `drawPlot`: one renderer for every plot.
- `handlePoints(model, rect)` and `valueAtPixel(...)`: handle geometry that shares the renderer's layout.
- `entrainmentMapData(result)`: `{siteId: {ppiMinusTclMs, captured, near}}`, for the Network gold return arc.
- `tableHtml(table)`: the accessible data-table alternative.
- `LAB_STYLE`: the plate palette and fonts.

Models are plain data and can be built in a Worker. A `compact` model omits its title, for use inside a card.

### inspector-card.js

**Pure functions:**

- `createParameterState(world)`
- `applyParameterEvents(state, events)`: follows `parameter_changed` with cause `command` only. Agent and lesion changes are tissue states, not model edits. tone, autonomic and other parameters are ignored.
- `editCommand(state, target, param, value)`: returns a command body clamped to the contract ranges, or null for a no-op.
- `applyCommand`
- `defaultCommands(world, state, target)`
- `modifiedElements(world, state)`: returns `{nodes, links, couplings}` Sets.
- `cardModel(...)`

**DOM component:** `createInspectorCard(container, {world, enqueue, labels, onModifiedChange, onClose})` returns `{open(target), update({snapshot, events, tMs}), close(), state, modified(), element}`.

**Handles:** DOM `role="slider"` elements placed over the canvas.

- Arrow keys change the value by 1 ms, or 10 ms with Shift. Up and Right increase it.
- A pointer drag previews the new curve and commits one command on release.
- Number fields commit on `change`.

**Mapping to commands:**

| Edit | Command |
| --- | --- |
| Site with restitution | `setRestitution` |
| Fixed-ERP site, or a 1.0.0 world | `setNodeERP` |
| Automatic focus cycle | `setAutomaticity` |
| Link delay | `setDirectionDelay` |
| Link decrement | `setDecrement` |
| Link entry slowing | `setEntry` |
| Coupling | `setCoupling` |

## Integration notes (for the integration ticket)

1. **Commands.** `enqueue(body)` receives a body without `commandId`, `runId` or `tMs`. The host stamps those with the runtime's live placement and logs the command. That log is what makes the edits replayable.
2. **Card updates.** Call `card.update({snapshot: engine.readAt(presentedMs), events: eventsUpToPresented, tMs: presentedMs})` from the presentation loop. Never pass engine-head state. A new run ID resets the card's state to the world.
3. **Modified marks.** Pass `onModifiedChange(({nodes, links}) => renderer.markModified(...))` to draw the small open rings on the canvas.
4. **Worker URL.** `scripts/build.mjs` inlines modules into a classic script. The lab modules pass that transform (checked), but `import.meta` cannot be used, so the host must pass `workerUrl`. In the single-file `dist`, either omit it (main-thread fallback, fine for Echo) or build a Blob URL for a bundled worker.
5. **CSS.** Include `src/lab/lab.css`. The card fonts are EB Garamond and Inter, with Georgia and system-ui as fallbacks.
6. **Plots.** Draw into a canvas sized by CSS pixels times DPR, then `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`. Show `summary(model)` as text and `tableHtml(table(model))` in a `<details>` for accessibility.
7. **Echo study world.** The Echo study world is owned by 13a. Point `s1s2` at it with `sites: {atrium: 'CSp', his: 'H', ventricle: 'V'}` and `labels`. The guided "Find the echo" protocol corresponds to `s2: {fromMs: 440, toMs: 200, stepMs: 10}` (or 4 to match the plate).

## Screenshots

- `lab-01-plate6.png`: plate 6, re-made from engine runs. Fast-pathway restitution with handles and live point, the S1–S2 output curve with the atrial, slow and fast ERPs marked by rule, and slow-pathway dots on the decrement law.
- `lab-01-plate4.png`: plate 4. The jump (+178 ms at 296), staircase, and return plots for breath, Meter 5:4 and Hemiola drifting and locked. All of these are now engine runs, where the plate used prototypes for some.
- `lab-01-protocols.png`: incremental pacing (Wenckebach 310), §B resetting curve with reference lines, entrainment stems, alternans cobweb at 300 ms, phase response, and the 1.1.0 slow pathway with entry dots.
- `lab-01-card.png`: both cards in Chromium after one keyboard tau edit and one dragged decrement edit, with modified badges and earlier dots faded.

## Open issues

1. **Spec oracle range for slow-pathway block.** See the spec note above: the range should be 236–240, or ERP oracles should be stated as [erp, erp + step].
2. **Card coverage.** The card covers sites and links. `setCoupling` is mapped (`target.kind: 'coupling'`), but no coupling card UI is built yet. The Hemiola slider can call `editCommand` directly.
3. **Entry curve on the conduction plot.** The entry curve is drawn against the destination's slack on the same x axis as source recovery. That keeps both laws checkable, but the axis label names only recovery. A model note explains the open dots.
4. **Agent part.** `delayParts.agentMs` (Slow the current) is excluded from the dots' y value, and lesions are shown through the current delay. Under the Slow agent the total sits above the curve by design.
5. **Scope.** Per the lead's scope note, v0.2 ships Echo, so the resetting, entrainment, phase-response/staircase and cobweb renderers are built and tested but have had less design iteration than the Echo plots.
6. **The shipped Echo world (12a) gives a smaller jump.** `src/worlds/echo.js` arrived with the final merge. The runner on it, using the plate grid, gives a jump of **+102 ms** at 296, FP ERP 296, SP ERP 236, CSp ERP 228 and sustained circulation at 8 couplings. At 1 ms steps the values are +101 at 299, 299, 238 and 229. The ERPs meet the ranges. The +178 ms figure is the v0.1 tuning (no restitution or entry), and the Echo oracle's own "jump ≥ 50 ms" is met. 12a or the lead should decide whether plate copy that quotes +178 should quote the shipped number.
7. **Entrainment capture.** The activation-order check is optional (`circuitIds`). Without it, capture means 3 cycles equal to the pacing cycle (±1 tick).
