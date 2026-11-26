# Counterpoint progress

**Restart here.** 2026-11-26 v0.1 candidate. The single-file build opens in Conduction and includes Circulation, Duality, swipe-to-cut, accessible connection controls, three palettes, preferences and the Laboratory. Contract v1.0.0.

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

On a browser-enabled host, run `python3 tests/browser_smoke.py --soak-minutes 10`. Keep the comparative listening verdict separate from browser and signal checks.
