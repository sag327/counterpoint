# Visual 05a and 05b · Attempt 01 · 2026-11-26

Implemented the Circulation stage against contract 1.0.0, handoff §8, design plates 01–03 and the material study. Ready for lead review. The renderer, visual verification and this receipt are in `src/visuals/renderer.js`, `tests/visual.test.js` and `docs/runs/visual-01.md`.

## Reproduce

Run `node --test tests/visual.test.js` with Node 24 and `@napi-rs/canvas`. The test uses the copy provided by `CODEX_PRIMARY_RUNTIME_NODE_MODULES` when that environment variable is set. Generate the comparison sheet with `node tests/visual.test.js /tmp/counterpoint-visual-fixture.png`. The production renderer itself needs only the browser Canvas 2D API.

The comparison sheet shows 420 × 284 CSS px frames rendered at DPR 2. Rest, B at 240, 300 and 450 ms, and C at 1000 ms use the analytic contract fixtures. The collision approach and dissolution panels use synthetic events scoped to one link. The pending gesture panel uses test input against a rested frame. The grayscale and reduced-motion panels are variations on those same fixture renders.

## Observations

| Check | Observed |
|---|---|
| Rest and layout | At 420 × 284, rest drew an unbroken eight-knot wreath, R0 at twelve o’clock and an open center. The rest frame matched at 0 and 500 ms. Hit testing reached 21 CSS px from a node center and returned null beyond 22 CSS px. Resizing at 360 × 330 and 500 × 400 repositioned targets and preserved the backing resolution cap. |
| B at 15 and 30 ms | Two heads shifted from the respective quarter points to the midpoints of L0 and L7. The reverse head moved along the same path geometry as its corresponding forward direction. |
| B at 240, 300 and 450 ms | Two capture blooms at 240. R7 capture and R1 arrival-side block arcs at 300. One traveling head on L4 at 450, from R5 toward R4. |
| Recovery | R1’s core brightened across its refractory, partial and full recovery samples. |
| Collision | Opposing heads appeared before the synthetic collision and cleared at its event time. A small hollow mark appeared at the specified position. |
| C before cut, at cut and at restore | The L4 midpoint was lit at 990, gapped at 1000 and continuous at 1500. At cut, the separate wave on L3 stayed visible. |
| Pending input | A dotted outline appeared at the target, cleared by its presented target time and fenced out when rendering a fresh run. |
| Reduced motion and grayscale | The active segment stayed fixed at different times in the same transit. Block arcs stayed identifiable in reduced motion and grayscale. The disabled-link gap stayed open in reduced motion. |
| Actual engine parity | Rendered historical snapshots from the production engine after it committed the full B and C streams. Native Canvas frame PNGs matched fixture PNGs byte for byte for B at 30, 240, 300 and 450 ms and C at 990, 1000 and 1500 ms. |

The ring is 66% of the shorter CSS stage dimension. The underlying path is approximately one CSS px wide. The path and four quieter filaments are cached together, with the cache refreshed when stage size, DPR or enabled links change. The renderer takes presentation snapshots and ordered event history, and applies only the events from the visible run up to the visible cursor. The motion setting preserves the same event cursor and replaces the moving head with a static active-link cue.

Browser playback, touch and actual device display review belong to the integrated gate. Local native Canvas tests and the rendered fixture sheet passed. The local Chromium launcher had no browser executable, so this receipt covers the native Canvas harness. Lead review and independent disposition are pending.
