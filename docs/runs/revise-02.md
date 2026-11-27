# Revise 02 · live S1–S2 curve and model controls · 2026-11-27

Branch `study-2-revise`, milestone M2 (see [HANDOFF.md](../../HANDOFF.md)). It implements the creator's request that curves such as the AH jump build live while pacing, and that the simulation has tunable high-level parameters.

## What changed

- **`src/lab/live-curve.js` (new).** A pure store that turns every premature single stimulus at the pacing site (CSp) into one point: A1–A2, the coupling from the previous CSp activation, against A2–H2, the time to the first causally descended His activation. Drive pulses from a train (`triggerId` `…#k`) are S1 by definition and never count. A stimulus counts as premature when its coupling is ≥ 20 ms shorter than the cycle before it, so a player's touch during sinus rhythm counts too.
  - A point is final only once playback has passed the stimulus by 1200 ms, so nothing is plotted before it is heard.
  - Points are kept across runs, so each Find the echo press adds one. On reset, the finished run's points are kept before its events are dropped. A world switch clears the curve.
  - `liveCurveResult` detects the jump (≥ 50 ms within a 20 ms step), AV block and atrial refractoriness. `liveCurveModel` draws them with the shared S1–S2 renderer on a fixed EP frame (A1–A2 200–420 ms, A2–H2 60–320 ms) that the data can widen. Beats blocked before His show as open marks on the floor. The plot has a data table.
- **Lab layout.** The order is now Model, Live curves, Protocol runner. The first live curve is **S1–S2 · as you pace**.
- **`src/lab/model-controls.js` (new) and the Lab "Model" panel.** Four sliders for Echo: fast pathway ERP (FP `erpMaxMs`), slow pathway ERP (SP), slow pathway antegrade conduction (SL ab `delayMs`) and slow pathway antegrade decrement (SL ab `decrement.maxExtraMs`).
  - Each slider applies on release through the inspector card's new `edit()` method. It uses the same logged commands as the card handles (`setRestitution`, `setDirectionDelay`, `setDecrement`), so edits replay and carry into new runs.
  - **Study defaults** calls the card's new `restore()` method. Edited sites show the existing modified ring on the canvas.
  - While the transport is paused, edits are refused with "Resume to change the model."
- The model note no longer mentions Staves.

## Verification

| Check | Result |
|---|---|
| `npm test` | 180 pass. New `tests/live-curve.test.js`: 21 guided runs give 21 points, and each matches the headless S1–S2 runner row (captured, A2–H2). Points obey the settle rule and keys never repeat. A sinus-rhythm touch is measured from the prior activation. New `tests/model-controls.test.js`: defaults sit in range, each slider edit reads back, and carried commands replay identically to a world built from the edited state. |
| `npm run check:contract`, `npm run build` | pass, 550 KB single file |
| `tests/browser_integrate.py` (Chromium 153, file://, desktop and phone) | PASS both. The new step checks that a fresh guided run (S2 380 ms) appears as a live point with drive 600 ms, the live figure summary, the FP slider logging `setRestitution` at 340, and Study defaults restoring 304. One earlier desktop run failed in the existing press-and-hold inspector step, then passed on rerun: a headless timing flake of the kind recorded in integrate-02, unrelated to this change. |

The full 21-run curve, rendered offline with native canvas, reports "21 premature beats, 17 conducted to His; jump of 105 ms at 290 ms; AV block at 230 ms; atrium refractory at 220 ms". This matches the runner and plate 6 tuning. See [live curve, all runs](revise-02-live-all.png), [first three runs](revise-02-live-3.png), [Model panel (phone)](revise-02-phone-model.png) and [Lab (desktop)](revise-02-model.png).

## Notes for the creator

- The live curve is in the Lab. A small version could sit under the canvas while pacing, if you want it visible without opening the Lab.
- Only Echo has model sliders. Conduction and Circulation (the introductory pair) could get their own, such as AV node ERP and decrement or ring ERP and link delay, once they move to contract 1.1.
