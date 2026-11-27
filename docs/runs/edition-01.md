# Edition 01 · Circulation-only shareable preview

**Request (creator, 2026-11-27):** a separate site with Circulation alone and no links to the other models; the sound fixed to Chamber / balanced; no Ladder diagram for Circulation; something to share before the rest is ready.

## What changed

- `src/ui/edition.js` defines editions. The source is `full`; `scripts/build.mjs --edition circulation` rewrites `EDITION_ID` at bundle time and sets the title to "Counterpoint · Circulation".
- `npm run build` now writes `dist/counterpoint.html` and `dist/counterpoint-circulation.html`.
- The edition:
  - has Circulation as its only world; the world bar is hidden, and URL fragments cannot switch world;
  - shows the Network view only; the view bar is hidden, and `view=ladder` is ignored;
  - fixes the sound to Chamber / balanced, with the palette and voicing controls hidden;
  - stores preferences under its own key, so it never inherits a palette from the full app.
- The full app is unchanged.
- `scripts/build-site.mjs` publishes the edition at `_site/circulation/index.html`. No page on the site links to it.
- Fix carried in: `#inspect-list` had kept a stray `hidden` attribute since M6; removed.

## Evidence

- 193 Node tests pass, including `tests/edition.test.js`. `check:contract`, the host harness and the offline music check pass.
- Chromium smoke:
  - The new Circulation-edition pass at 1280×900 and 360×800 opens with `#study=echo&view=ladder`.
  - It checks one world, Network only, hidden sound controls, no links and Circulation-only events.
  - It opens the inspector, finds no horizontal overflow and no page errors, and makes no network requests.
- The rest of the smoke suite and the integration suite pass.
- Screenshots: `edition-01/`.
