# Counterpoint · Study No. 1

Counterpoint is an audiovisual instrument made from a graph of electrically excitable sites. Each accepted activation makes a note and can launch neighboring waves. Recovery changes the sound and determines whether the next impulse can pass. This is an experimental artwork and simplified phenomenological model.

## Play

Open `dist/counterpoint.html` in a modern browser to begin. Sound starts after you interact with the page. The standalone file contains its graphics, synthesis and styles. It makes no network requests.

| World | What to try |
|---|---|
| Conduction | Watch 600 ms pacing from the top site send a phrase through the branch. **Premature impulse** restarts the pathway and demonstrates how a closely timed impulse travels more slowly. |
| Circulation | With pacing off, tap a site to send a brief phrase both ways. **Find a rhythm** resets the ring, applies two impulses at 0 and 240 simulated ms, and lets the resulting wave circulate. |
| Echo | Watch paced beats travel through two AV nodal pathways. **Find the echo** demonstrates a single echo, and **Find the arrhythmia** demonstrates sustained reentry. |

Tap a site or focus it with Tab and press Enter or Space. While pacing is active, this moves the pacing site. With pacing off, it delivers one stimulus. **Reset** starts a fresh run.

Use the **Pause** and **Play** icons, the sound icon, and the **Playback** menu to control playback. All models use Chamber with the Balanced voicing. The **Laboratory** reports model and audio state, displays a rolling activation raster and filtered event log, and runs reference protocols. Its Circulation coupling field uses simulated milliseconds. An export includes the world definition and the run’s retained events and commands.

## Verify

The working release is v0.1. The shared engine, actual event-to-note mapping, native Canvas output and bundled UI with simulated browser APIs have been checked. Live browser, physical mobile device and human audio audition validation are pending. See [STATUS.md](STATUS.md) and [gate evidence](docs/COVERAGE.md).

Node 22+ (tested with Node 24) and Python 3 with `jsonschema` run the source gates. Native Canvas tests find `@napi-rs/canvas` in the supplied runtime or a local installation. The browser matrix requires Python Playwright and a usable Chromium executable.

```sh
npm test
npm run check:contract
npm run build
node tests/host-integration.mjs
python3 tests/browser_smoke.py --soak-minutes 10
sha256sum -c RELEASE.sha256
```

To serve over HTTP, run `python3 -m http.server 8000` from this directory and open [the local release](http://localhost:8000/dist/counterpoint.html). Run `node tests/music-offline.js --worlds /path/to/output` to render comparable, signal-checked Conduction and Duality takes. The supplied Circulation WAVs match the existing synthesis baselines.

[STATUS.md](STATUS.md) indexes the receipts. [contracts/README.md](contracts/README.md) defines event ordering and clock behavior. [DECISIONS.md](DECISIONS.md) records production choices. The original design and handoff are under `design/`.
