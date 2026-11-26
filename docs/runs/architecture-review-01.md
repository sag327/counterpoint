# Architecture review 01

Reviewed against contract 1.0.0, the analytic A/B/C oracles and handoff §§4.8, 7 and 10.2. This is an integration review during implementation. The source locations below identify the initial review snapshot.

| Priority | Finding | Reproduction and acceptance |
|---|---|---|
| Release blocker | In `src/ui/app.js`, `newRun` opens the fresh mixer bus before `transport.reset`. A reset that synchronously fences the prior schedule can close the new bus before its first commit. | Bind the new bus inside the transport reset notification, after the fence and before the initial advance. Begin with sound, induce twice while an onset is pending, and assert the three first capture IDs reach their respective new buses exactly once. Check that obsolete scheduled sources cannot reach the output. |
| Release blocker | The audio interruption listener is installed during module startup, when `context` is null. Audio Begin also exposes a new context as the shared clock before resume succeeds. | Register the handler on a successfully initialized context. Exercise a real or mocked suspended context, recovery, explicit Resume, denied audio followed by silent Begin, and concurrent Begin presses. Verify the same run freezes at its committed boundary, old sources are fenced and no backlog plays. |
| Release blocker if present in dependency graph | The build script only recognizes a subset of ESM. A temporary example barrel containing `export { x } from './mapping.js'` reports a successful build but emits an invalid script. | In an isolated project copy the hand-built bundle passed its write step, then `node --check` failed on the leftover `from './mapping.js'`. Close with the real module graph, an extracted HTML script parse check and a local browser boot. Use replacement callbacks for literal JavaScript insertion. |
| High | The UI compares `transport.state` directly to a string and handles every non-running value as resumable. The actual runtime shape and pause-drain lifecycle must match the UI. | Verify the actual `state` shape and subscription signature. Exercise taps, cuts, pause, a second click during the drain, then resume. Preserve the original bus until the already-committed interval finishes. |
| High | Link controls read only the last rendered frame. Two toggle requests before the next presentation can produce two disable commands. A reset can also leave an old-run frame usable until the next animation. | Submit cut then restore on a link within one lookahead, including immediately after reset. Assert command order, two real transitions in distinct requested states, and final enabled state. Clear pending and last frame by run. |
| Medium | `allEvents` grows throughout the run and the UI scans it on every frame. The renderer already has a backwards search with a 74 ms cutoff. | Keep a bounded chronological event buffer, maintain independent capture totals and show truncation in exports. Measure per-frame work after a sustained run with the inspector closed and open. |

The frozen fixture checker ran successfully with 25, 79 and 89 events for A, B and C. The canvas renderer filters by run and cursor before drawing event glyphs and interpolates transit positions from the engine's recorded times. The UI draws from `transport.frame().snapshot`. The pure mapping checks event type before generating a note. These observations do not establish live scheduling or integration acceptance.

## Follow-up on the integrated ring

The implementation now uses the runtime's string `status` getter, disables Resume during the pause drain, checks nullable live submissions, records pending link state and resets the mixer bus before the fresh head is committed. Audio creation is guarded and the context interruption handler is attached after successful resume. Silent mode labels its sound controls. The event archive is bounded at 4,096 events with an eviction count and independent capture total. The build syntax-checks its emitted JavaScript and inserts it literally. The production module graph built with the supported import and export forms.

The release script was exercised directly in Node's VM with the real app, engine, transport, mapping, synthesis, mixer and native Canvas 2D. DOM input, audio nodes and timer services were instrumented. The run followed Begin, two guides, bounded pause, explicit resume, suspended audio, a second resume and two link toggles before the next presentation.

| Check | Observed |
|---|---|
| Future sources from an older run | Two pending buffer sources stopped and disconnected before their original deadlines. |
| Fresh run identity | Three successive runs each delivered its own first activation e2. The nine scheduled identities had zero duplicates and zero stale submissions. |
| Pause | Input at the pause drain was disabled. Presentation stopped at the committed 21.25 ms boundary. |
| Context suspension | The committed 36.25 ms boundary held during a simulated one-second interruption. Explicit same-run resume produced no immediate backlog attacks. |
| Rapid link toggle | The engine emitted disabled, then enabled, in submission order. |
| Actual engine and fixture contract | Under 13.17 ms advances, every event payload matched the frozen A/B/C streams (25, 79, 89). The native Canvas fixture assertions passed. |

This is deterministic host-level integration evidence. The local Chromium launcher exited 127 because its executable target was missing. This review provides no desktop browser, audible output, human listening or real-time soak evidence. The production engine uses an agenda for launches, arrivals, automaticity and collisions. The guide submits two external stimuli. No production fixture import appeared in the module graph.

One remaining diagnostic defect was reproduced on a one-node world, with `processingBudget: 4` and stimuli at 0 and 1 ms. The engine fault preserved the two complete events at 0, snapshot recovery reflected the capture, and the transport advanced its reported boundary to 0. The host received no corresponding log events. Preserve the fault's completed event prefix for diagnostics without scheduling new audio after the fault. This case is outside ordinary ring playback. Final acceptance should also verify a built-in browser and any new worlds separately.

## Lead resolution after review

The fault-prefix defect is corrected by runtime `onFault(error)` exposing the engine's completed `error.events` after old audio is fenced. UI appends these to diagnostic history without scheduling notes. Runtime regression verifies the completed earlier batch, failed instant, frozen horizon and absence of scheduled fault-prefix sound. Lead's final full suite passes 37 entries. Manual pause also uses explicit mixer `preserveBoundary` so an onset exactly at the inclusive commit boundary is allowed to decay; reset/interrupt cancellation remains inclusive. Browser and actual listening remain open.
