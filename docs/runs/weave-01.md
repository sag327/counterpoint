# Circulation reweaving prototype

2026-11-27. Standalone motion study on study-2-integrate.

Build with `node scripts/build.mjs --weave`. Open `dist/circulation-weave.html` directly. No network dependencies. Production Circulation remains unchanged.

Three fixed experiments use the real deterministic engine: single stimulus, S1/S2 at 240 ms (unidirectional block and sustained reentry), and S1/S2 at 340 ms (bidirectional conduction and extinction). R1–R3 have ERP 300 ms, all other sites 200 ms; all links have 60 ms delay. Top and bottom neutral sites are short ERP. This is an isolated world derived from the existing Circulation factory.

Three thin coaxial filaments separate after activation and gather according to remaining ERP. Shape is stable per site; neighboring curves are artistic interpolation rather than continuous tissue simulation. Ready geometry starts at ERP expiry, independently of the engine's recovery tail. Failed arrivals dissipate without activation, note, or resetting recovery. Blue has longer ERP; gold shorter. Fixed baseline property is currently identified by hue and the persistent region captions, not by a separate non-color texture.

Playback uses a finite precomputed 3600 ms engine trace with 2×, 4× or 6× time dilation. Pause, scrub, restart, scenario selection, optional existing Counterpoint voices. No autoplay. Scrub is silent, each resumed audio generation is fenced. Hidden pages pause. Sound uses a 120 ms scheduling horizon; late wakes omit overdue notes rather than replaying them in a burst. This is a motion study transport, not production live interaction.

Validation: 175 Node tests pass, including induction, extinction, unchanged refractory deadline after block, and opening at ERP boundary. Contract fixtures pass, production and prototype builds pass. Headless Chromium desktop 1000×1000 and phone 390×844 checked with no page exceptions or horizontal overflow. Exercised sound toggle, play/pause, scrubbing and scenario switching. Screenshots in docs/qa/weave. Actual acoustic quality needs listening review.

Next: user review of the motion, especially legibility of the residual blue opening at the blocked arrival and organic quality of the local tapered shapes. Decide whether baseline ERP needs additional non-color encoding before integrating into production. No main-branch merge or deployment in this pass.
