# pages-01 · Ticket 15d · GitHub Pages

## What changed

- `site/index.html`: self-contained title plate (inline SVG ring, system fonts, no network requests, reduced-motion respected, no audio, OG/Twitter meta). The program lists the eight studies with the plain subtitles from the spec. All eight are marked "in preparation" because v0.1 contains none of them; the order is unchanged. Enter opens `./play/`; Notes is an in-page section; "Download for offline" links to `./play/counterpoint.html` with the `download` attribute.
- `scripts/build-site.mjs` (`npm run build:site`): writes `_site/` with `index.html`, `play/index.html`, `play/counterpoint.html`, `og.png` (1200x630 centered cover crop of `design/plates/plate1_ladder.png`, via `@napi-rs/canvas`) and `.nojekyll`. Run it after `npm run build`.
- `.github/workflows/pages.yml`: on push to main and manual dispatch. checkout@v5, setup-node@v5 (Node 22), `npm i --no-save @napi-rs/canvas`, `npm test`, `npm run build`, `npm run build:site`, upload-pages-artifact@v4, then deploy-pages@v4 in a separate job. A failing test stops the build job, so nothing deploys.
- `.gitignore`: `_site/`.

## Manual step for the owner

Settings, Pages, Source: choose **GitHub Actions**. Until this is set, the deploy job cannot publish.

## Verification

- `npm test`: 47 pass, 0 fail. `npm run build` and `npm run build:site` succeed. `og.png` is 1200x630 PNG.
- Chrome (`/usr/bin/google-chrome`) with Playwright: `_site/index.html` loaded at 1440x900 and 390x844. Zero non-file requests at both widths. No horizontal overflow on phone (scrollWidth 390). Screenshots: `pages-01-desktop.png`, `pages-01-phone.png` (ring stacks above the program on phone).
- Not verified: the workflow itself has not run (not pushed); action major versions were chosen from knowledge, not checked against the marketplace. The og.png crop was not inspected visually. Notes is a short in-page section, not the separate essay page the spec mentions.
