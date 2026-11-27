# Handoff · Study No. 2 revision pass

**Restart here.** This file is the rolling handoff for work that may stop at a usage limit. Each milestone updates it before its commit is pushed.

- **Branch:** `study-2-revise`, based on `study-2-integrate` (`c4d55ee`). `main` still holds v0.1.
- **Spec:** `design/study-2-spec.md`. The creator's later revisions override it where they differ. See the table in [docs/runs/revise-01.md](docs/runs/revise-01.md) and the 2026-11-27 entry in `DECISIONS.md`.
- **Setup:** `npm i --no-save @napi-rs/canvas`. Then `npm test`, `npm run check:contract`, `npm run build` and `node tests/host-integration.mjs`. For the browser check: `python3 tests/browser_integrate.py --chromium /usr/bin/google-chrome --screenshots /tmp/shots`.

## Milestones

| # | Milestone | State | Receipt |
|---|---|---|---|
| M1 | Creator revisions: no musical labels, Staves hidden, Duality withdrawn, playback 1/4 to 1/12 speed, EP-relative readouts | DONE | [revise-01](docs/runs/revise-01.md) |
| M2 | Live curves while pacing (the AH jump curve builds from the running performance) and high-level model controls | NEXT | — |
| M3 | Browser verification, STATUS update, PR to the creator | TODO | — |

## M2 plan (next agent starts here)

1. **Live jump curve.** In `src/ui/lab-panel.js` (Live curves), add an "S1–S2 from this performance" plot. Build it from the retained events with `src/lab/measure.js`. For each S2 stimulus at CSp (`stimulus_attempted`, `source: 'stimulus'`, commandId `S2`), take the coupling interval A1–A2 at CSp and the resulting A2–H2. Accumulate points across guided runs, because each Find the echo press is a fresh run, so the curve grows as the player steps S2 earlier. The store lives in `app.js` and survives `startRun` resets, but a world switch clears it. Draw it with the existing `plots.js` S1–S2 renderer so the jump annotation and data table come for free.
2. **Also accept performer pacing.** Any `stimulate` command at an atrial site during steady drive counts too. Take the coupling interval from the previous CSp activation. EP-relative only, never cumulative time.
3. **High-level controls.** A small "Model" group in the Lab with sliders for fast pathway ERP (FP `erpMaxMs`), slow pathway ERP (SP), slow pathway conduction (SL delay) and nodal decrement. Each slider maps to an existing logged command (`setRestitution`, `setDirectionDelay` or `setDecrement`) through `card`'s enqueue path, so edits replay and carry across runs (`carryCommands`). Add a "Study default" reset.
4. **Tests.** A unit test that feeds a scripted sequence of guided runs into the store and checks the points match `runProtocolSync` S1–S2 rows for the same S2 values. Also a replay test for slider commands.
5. Update this file and write `docs/runs/revise-02.md`. Then commit and push.

## Open items carried from v0.2 (creator only)

Physical phone review, a listening verdict at 1/4 speed, and the 10-minute soak on a real browser host (see `docs/runs/integrate-02.md`).
