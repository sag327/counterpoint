# v0.1 release candidate · 2026-11-26

The standalone output is `dist/counterpoint.html`. Its digest is recorded in `RELEASE.sha256`. The source archive contains the source, exact built output, tests, frozen contract, design handoff, signal evidence and receipts.

## Reproduce

```sh
npm test
npm run check:contract
npm run build
node tests/host-integration.mjs
python3 tests/browser_smoke.py --soak-minutes 10
sha256sum -c RELEASE.sha256
```

## Observations

- The previous P0 source passed 37 baseline Node test entries. The v0.1 run passes the expanded suite, the three contract schema and frozen-payload checks, and the syntax-checked single-file build.
- Production presets pass E19 and E20. Six Conduction captures form the first automatic phrase. On a rested path N→H takes 65 simulated ms. The reference early atrial stimulus produces a 155 ms N→H delay and still captures V1 and V2. Changes to Duality A leave the B component’s actual history unchanged.
- Node-VM execution of the built HTML with controlled stand-ins covered Conduction as the opening scene, world changes, first activation and note joins, selection and controls, palette and storage writes, actual propagation after resume, hiding during asynchronous audio start and resume, cancellation, swipe, the button fallback, ring reentry, and termination. The 20-minute synthetic-clock run retained at most 4,096 events, peaked at 10 voice sources, held 27 cached voice buffers, and reported zero duplicate, stale or late notes and zero host errors. Repeated resets returned live voices to zero. See [independent integration review](architecture-review-02.md).
- Native Canvas verified event glyphs, cuts, directions, reduced motion, and P1 layouts at desktop and narrow sizes. The separate Laboratory DOM harness checked presented versus committed state, filtered log, site timing, link state, protocol validation and audio diagnostics.
- The live browser run stopped before launch. The Chromium wrapper was present at `/usr/bin/chromium` but its executable `/usr/lib/chromium/chromium` was missing. Playwright’s official browser download returned HTTP 403 under the host network policy. The separate desktop browser could not open the workspace build. The offline file, HTTP/mobile emulation, browser pointer lifecycle, real Web Audio, assistive technology and 10-minute browser checks remain open. No browser, device or live endurance pass is claimed.
- Human audio audition remains pending. The creator’s prior positive Circulation feedback and request for swipe-to-cut were treated as a usability decision to continue. The baseline 4× dilation and Balanced voicing are provisional listening choices.
