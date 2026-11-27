# Handoff · Study No. 2 simplification pass

**Restart here.** This file is the rolling handoff for work that may stop at a usage limit. Each milestone updates it before its commit is pushed.

- **Branch:** `main` (the `study-2-simplify` work merged as PR #2). Earlier base: `main` at `93f1ee5` (PR #1 merged: v0.2 Echo with the M1–M2 revisions). The creator allows merging into `main` when the block is done.
- **Spec:** `design/study-2-spec.md`. The creator's revisions override it (see `DECISIONS.md`, 2026-11-27 entries).
- **Setup:** `npm i --no-save @napi-rs/canvas`. Then `npm test`, `npm run check:contract`, `npm run build`, `node tests/host-integration.mjs`, `python3 tests/browser_integrate.py --chromium /usr/bin/google-chrome --screenshots /tmp/shots` and `python3 tests/browser_smoke.py --chromium /usr/bin/google-chrome`.

## Milestones

| # | Milestone | State | Receipt |
|---|---|---|---|
| M1–M3 | Revisions, live curve, model sliders, PR #1 | DONE, merged | [revise-01](docs/runs/revise-01.md), [revise-02](docs/runs/revise-02.md) |
| M4 | Remove cutting, mute/volume, S key, Echo header; fraction speeds; prominent instructions; selected-site halo | DONE | [simplify-01](docs/runs/simplify-01.md) |
| M5 | Preconditioned Find the echo / Find the circuit | DONE | [simplify-02](docs/runs/simplify-02.md) |
| M6 | Tiered inspector card; inspect and tune in every world | DONE | [simplify-03](docs/runs/simplify-03.md) |
| M7 | Gate run, merge into `main`, push | DONE | https://github.com/sag327/counterpoint/pull/2 (merged `7d6da76`, Pages deployed) |

## M5 · done

`transport.reset(..., { fromMs })` runs the engine silently to `fromMs` (events go to `onPrelude`, not to sound or frames). Echo's guided protocols set `presentFromMs: 4100` (`ECHO_PRESENT_FROM_MS` in `src/worlds/echo.js`). Tests: `tests/precondition.test.js`.

## M6 · done

The card leads with three key readouts (`KEY_READOUTS` in `inspector-card.js`) and puts the rest in `<details data-section>` sections (more, tune, table) that remember their open state. The card exists in every world: `scene.study` now gates only Echo's Stillness, live curve, runner and Model sliders.

## M7 · done

PR #2 merged into `main` at `7d6da76`; the Pages workflow deployed it. The next session starts from `main` and asks the creator what comes next (see follow-ups below and the open items).

## Possible follow-ups (ask the creator)

- Lab Model sliders for Conduction and Circulation (`MODEL_CONTROLS`). The card already tunes every site and connection.
- A preconditioned start for Circulation's Find a rhythm. It is short (two stimuli) and does not need one now.

## Key code (M1–M4)

- `src/ui/studies.js`: `SHOW_MUSIC_LABELS`, `VIEWS` / `ALL_VIEWS`, `WITHDRAWN`, `PLAIN_SUBTITLES`.
- `src/ui/preferences.js`: `DILATIONS`, `dilationLabel`. `src/runtime/transport.js`: `MAX_DILATION = 12`.
- `src/lab/live-curve.js`: live S1–S2 store and plot. The store lives in `app.js` as `liveCurve`, exposed as `counterpoint.liveCurve`.
- `src/lab/model-controls.js`: per-study slider specs. `inspector-card.js` gains `edit()` and `restore()`.
- M4: `DRAG_THRESHOLD` gesture tracking in `app.js` (drags do nothing); `renderer.setSelected()` draws the selected-site halo; `#protocol-hint.instructions` is the one-line instruction above the controls.

## Open items carried from v0.2 (creator only)

Physical phone review, a listening verdict at 1/4 speed, and the 10-minute soak on a real browser host (see `docs/runs/integrate-02.md`).
