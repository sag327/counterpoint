# Handoff · Study No. 2 revision pass

**Restart here.** This file is the rolling handoff for work that may stop at a usage limit. Each milestone updates it before its commit is pushed.

- **Branch:** `study-2-revise`, based on `study-2-integrate` (`c4d55ee`). `main` still holds v0.1.
- **Spec:** `design/study-2-spec.md`. The creator's later revisions override it where they differ. See the table in [docs/runs/revise-01.md](docs/runs/revise-01.md) and the 2026-11-27 entry in `DECISIONS.md`.
- **Setup:** `npm i --no-save @napi-rs/canvas`. Then `npm test`, `npm run check:contract`, `npm run build` and `node tests/host-integration.mjs`. For the browser check: `python3 tests/browser_integrate.py --chromium /usr/bin/google-chrome --screenshots /tmp/shots`.

## Milestones

| # | Milestone | State | Receipt |
|---|---|---|---|
| M1 | Creator revisions: no musical labels, Staves hidden, Duality withdrawn, playback 1/4 to 1/12 speed, EP-relative readouts | DONE | [revise-01](docs/runs/revise-01.md) |
| M2 | Live S1–S2 curve built while pacing; Lab Model sliders (FP/SP ERP, SL conduction and decrement) | DONE | [revise-02](docs/runs/revise-02.md) |
| M3 | Review candidate: full gate run, PR to the creator | NEXT | — |

## M3 plan (next agent starts here)

1. Run the full gate set: `npm test`, `npm run check:contract`, `npm run build`, `npm run build:site`, `node tests/host-integration.mjs`, `node tests/music-offline.js` and `tests/browser_integrate.py`. Rerun the browser suite once if the press-and-hold inspector step flakes (a known headless late-wake timing issue).
2. Open a PR from `study-2-revise` into `study-2-integrate`, or into `main` if the creator wants v0.2 released. Summarize M1 and M2 and link the receipts. Do not touch `RELEASE.sha256` or tag a release: the release gate belongs to the creator.
3. Then pick up the next spec work with the creator: v1.1 versions of Conduction (Prelude mechanics: overdrive suppression, Hold a tempo) and Circulation, the introductory pair, with live curves and model sliders like Echo's.

## Key code (M1–M2)

- `src/ui/studies.js`: `SHOW_MUSIC_LABELS`, `VIEWS` / `ALL_VIEWS`, `WITHDRAWN`, `PLAIN_SUBTITLES`.
- `src/ui/preferences.js`: `DILATIONS`, `dilationLabel`. `src/runtime/transport.js`: `MAX_DILATION = 12`.
- `src/lab/live-curve.js`: live S1–S2 store and plot. The store lives in `app.js` as `liveCurve`, exposed as `counterpoint.liveCurve`.
- `src/lab/model-controls.js`: per-study slider specs. `inspector-card.js` gains `edit()` and `restore()`.

## Open items carried from v0.2 (creator only)

Physical phone review, a listening verdict at 1/4 speed, and the 10-minute soak on a real browser host (see `docs/runs/integrate-02.md`).
