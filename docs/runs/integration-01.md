# Integration checkpoint — 2026-11-26

State: ACTIVE. Base: accepted ticket 00 / contract 1.0.0.

Recovered the saved Counterpoint-Ticket-00 archive. Simulation, sound, visuals and runtime assigned independent writable areas; lead owns UI/build/status. Sol medium for sound/visual/UI/QA, Sol high for simulation and runtime, Astra high for architecture review, as requested.

UI provides Circulation only until P0 gates pass; no placeholder navigation. Production imports real Engine, never presentation fixtures. Canvas has semantic 44px site buttons, sound begins only on explicit request, silent start shares transport. Reset/guide side effect disclosed beside controls. Laboratory displays retained event stream and exports with retention metadata.

Build: local dependency-free named-module bundling, parse check before artifact write, inline CSS and JS. No external assets. Build supports this source subset rather than arbitrary ESM; no default imports or export-from barrels.

Evidence and gate outcomes: pending worker integration and independent browser tests. Human listening remains pending. No P0 release claim at this checkpoint.

## Candidate integration results

Actual engine comparison (`tests/integration.test.js`) reproduces every frozen event payload for A/B/C under segmented advancement. Music intents preserve each accepted activation identity and timestamp. Independent architecture review executed the actual emitted inline script with native Canvas and instrumented audio/DOM/timer services: reset cancels scheduled old sources; same-run pause/interruption resume has no duplicate attacks; rapid cut toggles preserve the requested order. This is a host test, not browser execution.

Corrections incorporated: asynchronous Begin races and failed sound clock; interrupted context handling; status getter and pausing controls; pending cut state; run-order audio fencing; exact pause-boundary onset preservation; fault-prefix diagnostic events; event/command retention metadata; silent-mode control availability; disabled idle site controls; skipped-event visual floor; stale paused guidance; reset/guide while context suspended; functional build replacement and syntax validation.

The separate browser cannot reach the environment's static HTTP server. file:// policy also disallows opening the artifact there. Local Chromium wrapper has no executable. A normal HTTP client fetched byte-identical HTML, but that does not prove browser rendering, sound or mobile behavior. `07b` remains BLOCKED. Live browser 10–15-minute endurance and human audition remain unverified. P1 progression stays open rather than inheriting a false acceptance.

Lead final rerun: 36/37 Node test entries pass; contract check validates A 25/8, B 79/25, C 89/28 events/captures. Build parses and emits a self-contained artifact. Engine coupling sweep observed 220–299 ms inclusive at 1 ms spacing; sustained reentry shows 21 consecutive 480 ms return intervals. Human listening and live browser acceptance remain pending.

Reproduction of independent host soak: `node tests/host-integration.mjs` executes the actual bundle under simulated browser interfaces for 20 synthetic wall-clock minutes; 5005 captures, UI4096 retained/10923 discarded, engine4096 retained batches, mixer4 live sources/peak8/cache13, zero late or duplicate schedules, and 14 subsequent reset actions with no trapped errors. This is accelerated deterministic evidence, not live browser endurance.
