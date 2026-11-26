# Visual 09a · World geometry and swipe cuts · 2026-11-26

Conduction and Duality use the geometry in design plate 05 and the palette and event marks shared with Circulation. Conduction descends through four cool knots and forks at H into a warm pair. Duality's warm and cool three-node fans overlap horizontally and leave visible space between their paths. Each cubic link uses cached arc-length samples for the static filament, traveling marks, cut gaps and swipe geometry. The Circulation geometry and rendering retain their existing fixture comparison.

Run `node --test tests/visual.test.js` with the native `@napi-rs/canvas` module. Run `node tests/visual.test.js /tmp/counterpoint-p0-visual.png /tmp/counterpoint-p1-visual.png` to produce the frame comparisons. The sheets use 420 × 284 CSS pixels at DPR 2. The visual suite also checks targets at 360 × 330 CSS pixels.

| Check | Observation |
|---|---|
| Conduction branching | At 139 ms both moving heads occupy their respective curved branches. V1 shows a capture bloom at 150 ms. |
| Conduction premature impulse | After the A stimulus at 275 ms, a moving head remains on N→H at 390 ms. |
| Conduction branch cut | At 145 ms HV2 shows a gap and cancellation glyph. The parallel V1 head stays in flight. |
| Duality phrases | Warm heads occupy the A fan at 30 ms. Cool heads occupy the B fan at 207 ms. Reduced motion replaces the moving head with the shared stationary cue. |
| Swipe geometry | A radial gesture hits a ring link between samples and at a sampled vertex. A single long segment returns multiple links in travel order. Contact, tangency and node approaches are excluded. A shared pointer sample exactly on a link is recognized when the two adjacent gesture legs cross it. A turn back at that sample leaves the link intact. The cut path remains addressable for restoration. |
| Circulation | The existing fixture and engine Canvas parity checks pass at their seven bookmarks. |

`crossedLinks(start, end, previousSample)` accepts local CSS-pixel points. The optional previous point is the distinct sample immediately before `start`. Geometry is sufficient to report a crossing even when a disabled link displays a gap. The caller decides which commands to submit and fences input by gesture and run.

The frame sheet was inspected locally. These results cover native Canvas 2D, the engine snapshots and geometry. Browser pointer lifecycle and touch behavior are covered by the integrated browser checks.
