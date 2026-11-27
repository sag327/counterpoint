# Echo integration review · 2026-11-26

Source branch `study-2-integrate`, based on `61eb7bb` and the [initial integration handoff](integrate-01.md). This receipt covers the Echo integration candidate.

## Changes

- The generated site lists Echo as playable and its Enter link opens `./play/#study=echo`.
- On phones, Ladder and Staves use a separate status row, Staves labels fit, and Lab plot subtitles fit. The ERP labels sit on separate rows at the default 10 ms protocol step. The desktop card and Lab can sit side by side. Lab plots redraw to the available width without replacing their data controls.
- The completed Lab protocol and its result stay together for CSV export. Independent source review caught a stale variable in the first layout pass, and the final browser suite downloads and checks the CSV.
- The entrainment mark uses the full-circle drawing path when the arc closes. The existing K6 test exposed an issue in native Canvas 0.1.100 when drawing an exact full turn from the negative half-pi angle.

## Verification

| Check | Result |
|---|---|
| `npm test`, `npm run check:contract` | 173 passing Node tests and passing contract checks. The existing K6 test and a new narrow-width ERP label regression pass. |
| `node tests/host-integration.mjs` and both `node tests/music-offline.js` variants | Pass. The host harness covers the existing worlds and uses stand-ins for browser APIs. |
| `npm run build` and `npm run build:site` | Pass. Both copies under `_site/play` match the standalone HTML. On localhost, the site's Enter link selected Echo at 1280×900 and 390×844. |
| `tests/browser_integrate.py` | Chromium 149, offline `file://`, 1280×900 desktop and 390×844 phone emulation. In silent mode, the suite checks guided event timing, all three views, calipers, the card by hold and keyboard, Stillness, notes, and the real Worker result and CSV download. The phone run uses a Playwright-controlled page clock, and Chromium delivers the touch events. There were no page/console errors or unexpected network requests. |
| `tests/browser_smoke.py` | Desktop smoke passed on the base and candidate builds. The existing live mobile swipe timed out on both. Diagnostic runs found that native touch events reached the app and the renderer identified L1, then the transport paused on a missed scheduling horizon. A separate controlled-clock probe accepted exactly one L1 cut. |
| 10-minute desktop Chromium soak | The baseline paused before the 240-second sample. The candidate was running at 300 s and paused by the 360-second sample when a wake missed the commit horizon by 0.96 ms. It retained 4,096 events, peaked at eight voice sources, and scheduled no duplicate notes. The two late-note counts at startup stayed flat. The test stopped before the reset checks. |
| Independent review | GPT-6.2 Astra High reviewed the changes, the browser evidence, and the transport behavior. The CSV issue was fixed and a download check added. |

The candidate HTML SHA-256 is `ab1b0a20d835ad3b0f2110b2412c576e409cb034c4f6e82c0d0ffb82f1389ac2`.

Run from the repository root after installing the Canvas dependency used by the site workflow and provisioning Chromium and Python Playwright.

```sh
npm run build
npm run build:site
python3 tests/browser_integrate.py --chromium /path/to/chromium --screenshots docs/runs
python3 tests/browser_smoke.py --chromium /path/to/chromium --soak-only --soak-minutes 10
```

## Browser captures

| View | Desktop | Phone emulation |
|---|---|---|
| Network | [Network](integrate-01-network.png) | [Network](integrate-01-phone-network.png) |
| Ladder | [Ladder](integrate-01-ladder.png) | [Ladder](integrate-01-phone-ladder.png) |
| Staves | [Staves](integrate-01-staves.png) | [Staves](integrate-01-phone-staves.png) |
| Inspector | [Inspector](integrate-01-card.png) | [Inspector](integrate-01-phone-card.png) |
| Lab | [Lab](integrate-01-lab.png) | [Lab](integrate-01-phone-lab.png) |
| Notes | [Notes](integrate-01-notes.png) | [Notes](integrate-01-phone-notes.png) |

Physical phone review and the creator's listening verdict at 4× remain open. The current release checksum and any release tag are reserved for the release gate.
