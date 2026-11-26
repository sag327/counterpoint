# Gate evidence index

Checkpoint 2026-11-26, v0.1 candidate, contract v1.0.0.

| Gate | Evidence | Disposition |
|---|---|---|
| Frozen payloads A/B/C | `tests/check_contract.py`, `tests/integration.test.js` | Actual engine payloads match analytic fixtures. |
| E01–08, E14–18, E21–23 | `tests/engine.test.js`, [engine receipt](runs/engine-01.md) | Pass, including manual protocol D, event budget, active cuts, collision and 21 complete return intervals. |
| E09–13 | `tests/engine.test.js`, `tests/worlds.test.js` | Pass, including prospective parameter edits, decrement and automatic pacing before and after recovery. |
| E19–20 | `tests/worlds.test.js`, [world receipt](runs/worlds-01.md) | Pass. Conduction’s rested 65 ms and premature 155 ms delays match prediction. Duality component B is unchanged by stimulating or retiming A. |
| M01–03 | `tests/music.test.js`, `tests/integration.test.js`, `tests/host-integration.mjs` | Pass. All site captures have exact note joins. Palette changes leave the biological run and timestamps intact. |
| M04–08 | `tests/runtime.test.js`, [runtime receipt](runs/runtime-01.md), `tests/host-integration.mjs` | Pass using controlled clocks. Covers pause, reset, scene switch, interruption, latency bounds and handoff. |
| M09–11 | `tests/music-offline.js`, [music receipts](runs/music-02.md) | Signal and resource checks pass, including gain ramps and polyphony. |
| M12 | [Music receipts](runs/music-02.md) | Listening pending. |
| Visual semantics and swipe | `tests/visual.test.js`, [P0 Canvas](runs/visual-01.md), [v0.1 Canvas](runs/visual-02.md) | Actual engine and native Canvas checks pass for scenes, direction, recovery, cut gaps, reduced motion and crossing order. |
| Laboratory | [Inspector receipt](runs/inspector-01.md) | Engine and DOM harness pass. Browser layout and assistive technology pending. |
| Bundled artifact and endurance | `tests/host-integration.mjs`, [v0.1 receipt](runs/release-02.md) | Instrumented DOM/Canvas/Audio host pass, with 20 minutes advanced on a synthetic clock and repeated resets. |
| Desktop / mobile / offline / live endurance | `tests/browser_smoke.py`, [v0.1 receipt](runs/release-02.md) | Blocked by missing Chromium executable. |
