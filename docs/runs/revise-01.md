# Revise 01 · creator revisions to Echo · 2026-11-27

Branch `study-2-revise`, based on `study-2-integrate` at `c4d55ee`. Milestone M1 of the revision pass (see [HANDOFF.md](../../HANDOFF.md)).

## Creator decisions applied

These came from the creator after the v0.2 integration review. They narrow the spec's music-legibility layer for an EP audience.

| Decision | Change |
|---|---|
| The music analogy is too strong for EPs: keep the sound, drop musical labels | `SHOW_MUSIC_LABELS = false` in `src/ui/studies.js`. Echo's subtitle is now "Two routes through the junction". The musical subtitle is kept as `musicalSubtitle`. Layer 2 chips, glossary cards ("Words in this study") and pitch names (Lab inspector "Note identity", Staves pitch) are hidden. "Find the chord" is now **Find the circuit**. Status reads "Steady rhythm: atrium, then ventricle." |
| Hide Staves; keep for a possible return | `VIEWS = ['network', 'ladder']`, `ALL_VIEWS` keeps `staves`. The switcher button is removed and `#view=staves` is ignored. `src/visuals/staves.js` and its tests are untouched. |
| Remove Duality | The menu button and `SCENES.duality` are gone. The world module, its fixtures and its tests stay. `WITHDRAWN.duality` exposes it to tooling. |
| Time dilation 4–12×, shown as fractions and percentages | `MAX_DILATION = 12` in the transport. The UI offers 4, 5, 6, 8, 10 and 12× as "1/4 speed · 25%" through "1/12 speed · 8.3%" (`dilationLabel`). The control is labelled **Playback speed**. Stored preferences outside that set fall back to 4×. |
| Network default, audio on by default | Already true: Network is the default view, and **Begin · enable sound** is the primary action with Mute off. No change. |
| EP-relative measurements | Inspector card: **Since last activation**, **Last cycle length** and **Refractory remaining**, rounded to whole ms, replace the absolute "Last activation" and "Refractory until" clock times. The v0.1 Lab: "Since last activation" and "Refractory for N ms more". The metrics line no longer leads with cumulative simulated time. The event log keeps run time as its index. |

## Verification

| Check | Result |
|---|---|
| `npm test` | 174 pass (173 existing, with updated expectations, plus a playback speed test) |
| `npm run check:contract` | pass |
| `node tests/host-integration.mjs` | pass. The Duality world switch step is removed, and the Circulation switch covers it. |
| `node tests/music-offline.js` | pass |
| `npm run build`, `npm run build:site` | pass, 535 KB single file |
| `tests/browser_integrate.py` (Chromium 153, file://, 1280×900 and 390×844) | PASS both. It now asserts that there is no Staves button, no Duality button, the plain subtitle and the speed labels. The guided run uses 1/4 speed. |

Screenshots: [desktop](revise-01-network.png), [phone](revise-01-phone-network.png).

## Not changed

- Liner **Notes** stay linked. Their "musical idea" section is still a draft for the creator to rewrite or remove.
- The Pages title plate still lists the eight-study program.
- Palette and Chamber voicing controls stay. They shape the sound, not the labels.
