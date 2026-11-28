# Retrograde conduction in Conduction and Echo

## Implementation plan

1. Enable reverse travel along the existing physical links in the interactive Conduction tree. A captured V1 or V2 can conduct to H, then through N to A and S. The other ventricular branch can also capture from H. Atrial capture can reset the sinus focus. Keep the existing antegrade parameters. Use the same shared delay, decrement, entry, ERP and restitution laws in reverse, with nodal decrement applied to the traversal of the nodal pathway. Use symmetric delay laws as the initial model assumption. Preserve the fixed contract-v1 reference preset.
2. In Echo, enable V → H and H → LCP. Leave the already bidirectional fast and slow limbs intact. Let their measured arrival times and local recovery determine atrial breakthrough, collisions and block. Do not introduce an accessory pathway, obligatory VA capture, a scripted return beat, or a direction switch. Preserve the Circulation preset.
3. Trace an actual ventricular stimulus from each model's tap handler through the engine to the Network and Ladder views. Check reverse direction and optional status text for misleading forward-only assumptions. Keep automatic playback, existing pacing controls and sinus reset behavior.
4. Add deterministic regression cases using the production presets. A sufficiently late ventricular stimulus should reach the atrium via the expected upstream sites. A premature ventricular stimulus should demonstrate recovery-dependent failure to capture or propagate, including a case where the ventricle captures but upstream conduction fails. Verify that sinus beats do not repeatedly reflect and that Echo's single-echo and sustained-reentry protocols still give the intended outcomes. Adjust obsolete one-way assertions only where the expected physiology changes.
5. Run the full test suite, rebuild both release editions, refresh the checksums, and verify the built app. Document any parameter tuning or remaining limitations.

## Implementation and verification (2026-11-28)

The interactive Conduction preset now uses bidirectional links for SA, AN, NH, HV1 and HV2. Echo now uses bidirectional LH and HV; its two nodal limbs are unchanged. Each newly enabled direction copies the existing base delay, decrement and entry law. No antegrade values or tissue parameters were retuned. The fixed contract-v1 Conduction reference and both Circulation presets are unchanged.

The shared engine already launches into enabled incident directions, excludes the incoming physical link from immediate reflection, applies local ERP/restitution, resolves opposing waves, and resets a captured sinus focus. No engine changes were needed. In particular, the reverse NH traversal retains the 65 ms base delay and 90/120 ms source-recovery decrement law; decrement always uses the departure site's pre-capture recovery, including His on H→N. Existing tone/Breath modulation of decrement remains restricted to a nodal departure site.

### Deterministic production traces

A ventricular stimulus at 500 ms after the initial sinus beat produces the following causal captures. Times are simulated milliseconds; the opposite ventricular branch is listed separately from the upstream path.

| Preset / stimulus | Causal capture sequence |
| --- | --- |
| Conduction V1 | V1 500 → H 528.710 → N 607.745 → A 643.145 → S 668.242; V2 575.330 |
| Conduction V2 | V2 500 → H 549.559 → N 626.347 → A 661.667 → S 686.745; V1 575.760 |
| Echo V | V 500 → H 540.353 → LCP 595.372 → FP 628.093 → CSp 638.149 → HRA 668.149 → S 693.149 |

Echo's slower SP/LCP wave meets the opposing slow-limb wave after fast-limb atrial breakthrough. This is an arrival/collision result, not a selected return route. The sinus clock resets on the captured S and includes the existing overdrive suppression.

Premature Conduction V1 at 400 ms and Echo V at 420 ms fail ventricular capture. Echo V at 450 ms captures V but blocks in His at 485 ms. Conduction's shorter His ERP ordinarily permits His capture once the ventricle recovers; conditioning His at 350 ms, then stimulating V1 at 450 ms, captures V1 but blocks retrogradely in His at 481.246 ms. The tests follow stimulus descendants, so an atrial capture caused by the conditioning His stimulus is not misattributed to the ventricular stimulus.

### Input and presentation trace

A site pointer tap (`src/ui/app.js` pointer-up handler) or keyboard site button invokes `stimulate(nodeId)`. The existing handler submits a real `stimulate` command through `transport.submit`; its scheduled stimulus attempt enters the engine and launches the reverse enabled links on successful capture. The Network renderer uses `fromNodeId` against the physical link's a/b orientation for both the wavehead and passage/wake clock. Ladder uses the actual from/to tier ranks and marks reverse travel as retrograde. No forward-only rendering changes were required. Echo's static status now says “Sinus impulses travel from atrium to ventricle,” explicitly describing the baseline source while ventricular pacing can travel retrogradely.

`tests/retrograde.test.js` adds eight cases covering both ventricular branches, Echo upstream capture/collision, local refractory refusal, upstream His block, sinus reset, eight seconds without reflection, reverse Network passage clocks and Ladder marks. The existing premature-atrial source and bundled host assertions now include the expected S capture.

### Checks

- `npm test`: 210/210 pass, including the existing single-echo window and 60-second sustained Echo reentry oracles.
- `npm run check:contract`: pass, including frozen v1 traces and v1.1 event/law checks.
- `node tests/host-integration.mjs`: pass, including its 20-minute virtual soak and 14 resets; no host errors or duplicate/stale/late notes, and event/engine retention remains bounded at 4096. This completed against the release before the final status-only wording edit.
- `node --test tests/integrate.test.js tests/edition.test.js`: 12/12 pass after the final wording edit.
- `npm run build`: both self-contained release editions rebuilt after that edit.
- `sha256sum -c RELEASE.sha256`: both files pass.
- Independent Chromium QA: physical ventricular clicks and Network→Ladder switching passed for Conduction V1, Conduction V2 and Echo V.

The reverse travel laws are intentionally symmetric initial model assumptions, not patient-specific VA conduction measurements. Recovery can prevent local or upstream capture; bidirectionality does not guarantee VA conduction. There is no accessory pathway, scripted return beat or direction switch.
