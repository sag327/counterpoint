# Handoff · Study No. 2 simplification pass

**Restart here.** This file is the rolling handoff for work that may stop at a usage limit. Each milestone updates it before its commit is pushed.

- **Branch:** `study-2-simplify`, from `main` at `93f1ee5` (PR #1 merged: v0.2 Echo with the M1–M2 revisions). The creator allows merging into `main` when the block is done.
- **Spec:** `design/study-2-spec.md`. The creator's revisions override it (see `DECISIONS.md`, 2026-11-27 entries).
- **Setup:** `npm i --no-save @napi-rs/canvas`. Then `npm test`, `npm run check:contract`, `npm run build`, `node tests/host-integration.mjs`, `python3 tests/browser_integrate.py --chromium /usr/bin/google-chrome --screenshots /tmp/shots` and `python3 tests/browser_smoke.py --chromium /usr/bin/google-chrome`.

## Milestones

| # | Milestone | State | Receipt |
|---|---|---|---|
| M1–M3 | Revisions, live curve, model sliders, PR #1 | DONE, merged | [revise-01](docs/runs/revise-01.md), [revise-02](docs/runs/revise-02.md) |
| M4 | Remove cutting, mute/volume, S key, Echo header; fraction speeds; prominent instructions; selected-site halo | DONE | [simplify-01](docs/runs/simplify-01.md) |
| M5 | Preconditioned Find the echo / Find the circuit | NEXT | — |
| M6 | Tiered inspector card; inspect and tune in every world | TODO | — |
| M7 | Gate run, merge into `main`, push | TODO | — |

## M5 · preconditioned guided runs (next)

Creator request: at 1/8 speed the eight-beat drive is too slow to wait through. Start the run as it would stand after the 7th S1, then play live from the last S1, the S2 and (for the circuit) the S3.

- Today `find-echo` paces `S1` every 600 ms at CSp ×8 (S1#1 at 0 … S1#8 at 4200) and adds S2 at 4200 + coupling. `find-chord` adds S3. See `GUIDED`/`CHORD_STEPS` in `src/ui/app.js` and the protocol settings in `src/ui/studies.js`.
- Keep replay determinism: submit the same commands as the full protocol and only start *presentation* later. Advance the engine headlessly to t0 (one cycle before the last S1, e.g. 3600 ms), then start the transport clock at t0. The live curve and raster then see the full event history.
- Find the transport's start or segment origin (`segments`, `audioSecAt`) and add a `startAtMs` (or equivalent) that commits through t0 without scheduling sound or animation for earlier events. Add Node tests: identical event log to the full run; the first presented frame is at t0; no audio scheduled before t0.

## M6 · inspector tiers and every world

- `src/lab/inspector-card.js`: show the key readouts first (state, since last activation, refractory remaining, ERP). Put the restitution curve, parameters and history in `<details>` sections.
- Remove the `scene.study` gating in `setupCard`, `armHold`, `buildInspectButtons` and the site `onkeydown` in `app.js`. Add `MODEL_CONTROLS` for Conduction and Circulation, and add "Hold a site to inspect it" to their hints.

## Key code (M1–M4)

- `src/ui/studies.js`: `SHOW_MUSIC_LABELS`, `VIEWS` / `ALL_VIEWS`, `WITHDRAWN`, `PLAIN_SUBTITLES`.
- `src/ui/preferences.js`: `DILATIONS`, `dilationLabel`. `src/runtime/transport.js`: `MAX_DILATION = 12`.
- `src/lab/live-curve.js`: live S1–S2 store and plot. The store lives in `app.js` as `liveCurve`, exposed as `counterpoint.liveCurve`.
- `src/lab/model-controls.js`: per-study slider specs. `inspector-card.js` gains `edit()` and `restore()`.
- M4: `DRAG_THRESHOLD` gesture tracking in `app.js` (drags do nothing); `renderer.setSelected()` draws the selected-site halo; `#protocol-hint.instructions` is the one-line instruction above the controls.

## Open items carried from v0.2 (creator only)

Physical phone review, a listening verdict at 1/4 speed, and the 10-minute soak on a real browser host (see `docs/runs/integrate-02.md`).
