# Integration 01 · v0.2 "Echo" · 2026-11-26 · IN PROGRESS (handoff)

Branch `study-2-integrate` (worktree `/home/claude/wt-int`), based on study-2 at 9dec565. Work commit: c85ba1b. Stopped early at the lead's request (usage limit). Nothing pushed, `RELEASE.sha256` untouched, no tag.

## Checks at handoff

| Check | Result |
|---|---|
| `npm test` | 172 pass, 0 fail (162 existing + 8 `tests/integrate.test.js` + 2 `tests/music-echo.test.js`) |
| `python3 tests/check_contract.py` | pass |
| `node tests/music-offline.js` and `--worlds` | pass (v0.1 offline renders unchanged) |
| `node tests/host-integration.mjs` | pass after adding `location`, `history`, `URLSearchParams` and a few DOM stubs to the harness |
| `npm run build` | `dist/counterpoint.html`, single file, about 531 KB, no network references (the build throws if it finds an http(s) `src`/`href`) |
| `python3 tests/browser_smoke.py --chromium /usr/bin/google-chrome` | Desktop PASS. Mobile fails at the CDP touch swipe (`ring_cut_swipe(..., touch=True)`, timeout). **The same failure reproduces on the untouched 9dec565 build** (checked from a `git archive` copy), so it is pre-existing and not caused by this work. |
| `npm run build:site` | not run |
| Real-browser Echo smoke (manual Playwright probes, Chromium 153, file://) | Selected Echo through `#study=echo`, started silently, ran Find the echo, switched Ladder and Staves, dragged calipers, opened the card by press-and-hold on FP, opened the Lab, and ran S1–S2 in the **Web Worker** (`runnerMode = 'worker'`): "Jump of 105 ms at 290 ms; atrial ERP 220; fast pathway ERP 290; slow pathway ERP 230". Zero console errors or warnings, zero non-file requests. Desktop 1280 wide only. Screenshots were inspected but not saved to docs/runs. |

## What is wired and working

1. **Echo as a study** (`src/ui/studies.js` `SCENES`): the three v0.1 worlds unchanged, plus Echo from `src/worlds/studies.js`, with title, numeral, plain subtitle and glossary ids from `src/content/studies.json`. `#study-line` shows "II Echo / An arpeggio folds into a chord · Notes". The layer 2 chip (`#study-chip`) is hidden because Echo has none. Plain labels go on the canvas and EP labels in the Lab (`labels.plain/ep/lab`).
2. **Guided protocols** (`app.js` `guidedCommands`): **Find the echo** steps S2 from 400 to 200 ms in −10 ms steps (`echoPresentation` steps). **Find the chord** steps S2 from 300 to 240 ms with S3 equal to S2 (`CHORD_STEPS`, decision below). Each press resets the run with those labelled commands. The Lab shows "Last guided run: … S2 n ms".
3. **Music** (`src/music/mapping.js` `musicTableFor`): v1.0 worlds return null and keep their built-in tables. v1.1 worlds use `presentation.music`, and `audible:false` sites map to null whatever the table says. A missing assignment throws. The app passes `nodes: musicTable` to `mapActivation` and `describeNodeMusic`. Test `music-echo`: renders arpeggio, chord and echo runs offline at 1× and 4× and checks note identities equal the audible activations, exact silence before the first onset, headroom, every detected attack inside an activation's onset window, and an attack for each unmasked note.
4. **Views** (`src/ui/views.js` `createViews`, `#view-canvas`): Network · Ladder · Staves switcher, remembered in `#view=`. Ladder and Staves draw `allEvents`, the committed events including lookahead, at `presentedMs`. Tier and stave labels are plain on the canvas and EP when the Lab is open; pitch names show only in the Lab. Staves calipers: drag sets them, snapping to onsets; a tap clears them. In Ladder and Staves, `#status` moves to the top of the stage.
5. **Network** (`src/visuals/renderer.js`): the `layout` option builds a sculpture from `echoPresentation.layout`, with tissue colours and gently bowed links. Silent sites draw as open rings. `markModified` draws open rings on edited sites and links. `hitTestLink` was added. `setDim` dims the ground by 6% × the Stillness envelope. The new marks from 14c were already wired. v1.0 visual tests are unchanged.
6. **Inspector card** (`src/lab/inspector-card.js`, mounted in `#card-layer`): press and hold a site or link for 500 ms, or use the Inspect buttons in the Connections list, or press `I` on a focused site. Edits go through `transport.submit`, so they are logged in the command log and replayable. If the transport is not running, the card refuses the edit (`enqueue` returns false). Card changes:
   - `update` now tracks event ids (`e<seq>`), so pruning the 4096-event history cannot replay or reset edits;
   - `send` honours `enqueue() === false`.

   **Decision:** a reset or guided run carries the player's edits into the new run as t = 0 commands (`carryCommands`). The test shows that the result equals a run of `worldFromState`.
7. **Laboratory** (`src/ui/lab-panel.js` `createStudyLab`, `#lab-study`, created on first Lab open):
   - **Runner.** Protocols are S1–S2, S1–S2–S3 and incremental pacing, with editable fields, validation, a progress bar, Cancel and CSV export.
   - **Plots.** After a run, the S1–S2 conduction plot (jump) and output against input with ERP markers, or the incremental plot. Live curves show restitution for a chosen site, conduction for a chosen link and a Poincaré return plot. Every plot has a summary and a data-table `<details>`.
   - **Content.** Mechanism text, a model note, glossary cards and a button for the liner notes.

   **Worker decision:** the build embeds a second bundle (`src/lab/worker.js` as entry) as a `text/plain` script `#protocol-worker-source`. The app loads it as a **classic** worker from a Blob URL (`createProtocolRunner` gained `workerType`). Chromium refuses module workers from Blob URLs on file:// pages. The existing main-thread fallback remains.
8. **Stillness**: hold the open centre for 600 ms, press `S`, or use the Stillness button. This sends `applyAgent {agent:'stillness', doseScale:1}`. The background dims by 6% at the envelope peak (`stillnessLevel` uses the engine's `stillnessEnvelope`).
9. **Notes** (`src/ui/notes.js` `renderNotes`): an escaped Markdown subset is shown in a `<dialog id="notes-sheet">` in system serif at a 62ch measure, with a DRAFT mark. `echo.md` is bundled.
10. **Build** (`scripts/build.mjs`): supports default imports of `.json` (`with {type:'json'}`) and text files such as `.md` (build only). It inlines `lab.css` and `study.css`, embeds the worker bundle, and takes `--out <file>`.

## Partly done / not started

- **Screenshots** `docs/runs/integrate-01-*.png`: not saved. Phone-width layout is **not verified** in a browser; the CSS for the phone bottom-sheet card and Lab exists in `src/ui/study.css` @media.
- **Dedicated browser smoke script** for Echo (`tests/browser_integrate.py`): not written. The probes used are described above. The next agent should turn them into a script.
- **`npm run build:site`**: not run. `site/index.html` still lists all eight studies as "in preparation", and should mark Echo as playable.
- **Known layout issues:**
  - In the S1–S2 output plot (`plots.js` `s1s2OutputModel`), the atrial and slow-pathway ERP labels overlap at 10 ms steps.
  - On desktop the floating card overlaps the right part of the open Lab.
- **Not done:**
  - Ladder and Staves do not rotate to landscape on phones.
  - There is no "set calipers as reference" control, so ratios never show.
  - Ladder and Staves views cannot stimulate (site buttons are hidden there).
  - Swipe-to-cut in Echo is the v0.1 `setLinkEnabled` cut, not `ablate`.
  - Map overlay not wired (out of scope).
- **`host-integration.mjs`** still exercises only the v0.1 worlds.

## Next steps, in order

1. Write `tests/browser_integrate.py`: Echo, Find the echo, all three views, card by hold and by keyboard, S1–S2 run in worker mode, Stillness, notes sheet, zero console errors and network requests, at 1280×900 and 390×844. Save `docs/runs/integrate-01-{network,ladder,staves,card,lab,notes,phone-*}.png` and look at each one.
2. Fix phone layout problems found there, then the ERP label overlap.
3. Run `npm run build:site` and update the program copy in `site/index.html` for Echo.
4. Lead review, then release (RELEASE.sha256, tag) by the lead.

## Decisions

- **Find the chord.** S2 runs 300→240 ms and S3 equals S2. In the shipped tuning, S2 alone sustains circulation at 299–265 ms, and S3 changes nothing (headless check: identical outcomes for S3 ∈ {none, S2, 300, 260}). The S3 is kept because the spec names it, and it is honest labelled stimuli.
- **Edits across runs.** Edits are carried as t = 0 commands rather than baked into the world, so the modified rings and the command log stay truthful.
- **Worker.** A classic worker from a Blob URL, with the main-thread fallback.
- **Labels.** The canvas uses plain labels and the Lab uses EP labels. The view switcher is available for every world, including the v0.1 worlds.
