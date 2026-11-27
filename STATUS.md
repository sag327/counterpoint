# Counterpoint progress

**Restart here: [HANDOFF.md](HANDOFF.md).** Branch `study-2-revise` applies the creator's 2026-11-27 revisions to the v0.2 Echo candidate ([revise-01](docs/runs/revise-01.md)). The earlier [browser review](docs/runs/integrate-02.md) lists the remaining release checks.

**v0.1 candidate · 2026-11-26.** The single-file build opens in Conduction and includes Circulation, Duality, swipe-to-cut, accessible connection controls, three palettes, preferences and the Laboratory. Contract v1.0.0.

| Ticket | State | Evidence / next action |
|---|---|---|
| 00 | ACCEPTED | [Frozen contract and oracles](docs/runs/00-01.md) |
| 01–03b | ACCEPTED | [Engine receipt](docs/runs/engine-01.md) and actual A/B/C reference traces |
| 04a/b | ACCEPTED | [Music mapping and signal](docs/runs/music-01.md). Human listening pending under 08. |
| 05a/b | ACCEPTED | [Canvas and event semantics](docs/runs/visual-01.md). Device review remains open. |
| 06a/b | ACCEPTED | [Runtime and timing](docs/runs/runtime-01.md) |
| 07a | ACCEPTED | [P0 integration](docs/runs/integration-01.md), [v0.1 bundled integration](docs/runs/release-02.md) |
| 07b | BLOCKED | Live offline desktop, mobile browser and 10-minute browser run need a browser-enabled host. See [v0.1 release receipt](docs/runs/release-02.md). |
| 08 | REVIEW | Creator reported that the prior playable study worked well and requested swipe-to-cut. Comparative listening at 3×/4×/5× and the three Chamber voicings remains open. |
| 09a | ACCEPTED | [Production world traces](docs/runs/worlds-01.md), [native Canvas world and swipe review](docs/runs/visual-02.md) |
| 09b | ACCEPTED | [Palettes and diagnostics](docs/runs/music-02.md), [Laboratory](docs/runs/inspector-01.md), [bundled controls and preferences](docs/runs/release-02.md) |
| 10 | REVIEW | Final source and candidate artifact available. Device/browser review and human audition remain open. See [gate coverage](docs/COVERAGE.md). |
| 11a–11d | REVIEW | [Contract 1.1.0 receipt](docs/runs/contract-v11-01.md); [independent G1 review: PASS](docs/runs/g1-review-01.md). Lead decisions applied in 11e. |
| 11e | REVIEW | [Contract 1.1.0 amendments receipt](docs/runs/contract-v11-02.md): tone sign, train_completed on cancel, setAutonomic, permanent complete lesions, L2–L7, lintStudyWorld. v1 invariance passes. Next: lead review, then freeze 1.1.0. |
| v0.2 integration | REVIEW | [Echo browser review](docs/runs/integrate-02.md): desktop and phone-emulated Echo smoke pass, including Worker and CSV download. Layout corrections, site build, and 173 Node tests pass. Live Chromium timing, physical phone review, and creator listening at 4× remain open. |
| Revise M1 | REVIEW | [Creator revisions](docs/runs/revise-01.md): musical labels hidden, Staves hidden, Duality withdrawn, playback 1/4–1/12 speed, EP-relative readouts. 174 Node tests and the Chromium Echo suite pass on desktop and phone. |

On a browser-enabled host, run `python3 tests/browser_smoke.py --soak-minutes 10`. Keep the comparative listening verdict separate from browser and signal checks.
