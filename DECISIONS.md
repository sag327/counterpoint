# Decisions • 2026-11-26

| Decision | Reason / revisit condition |
|---|---|
| Freeze v1.0.0 as JSON Schema plus a prose behavioral contract. | Engine, audio and visuals can use common fixtures without choosing a build tool. The lead versions wire and semantic changes together. |
| Use an inclusive commit horizon with integer microsecond ticks and ms on the wire. | This gives equality at ERP a reproducible meaning across frame sizes. Revisit only with a failing timing example. |
| Parents form a chain through cause, transit and activation IDs. | Node merges retain both parents; revisiting a recovered node remains possible. |
| Keep ring trace fixtures and world under tests. | These files express an independently calculable target. Later tickets supply the production preset and real event evidence. |
| Use the 1000 ms L4 cut and a 1500 ms restore for fixture C. | The former exercises continued travel after the cut. The latter proves restore into silence. Ticket 03b separately cuts at 930 during transit. |

## 2026-11-26 — first implementation checkpoint

Lead: implement the frozen contract in dependency-free JavaScript modules and keep a local named-module build rather than add remote dependencies. Pure engine, mapper, renderer and transport remain separate. Production loads no test fixtures. Ship a single-file P0 candidate and the maintainable sources together. Browser acceptance and actual listening remain open; do not advance P1 based on an assumed artistic verdict.

Rendering retains gold/cool-blue fine filaments, an open center and separate 44px semantic interaction targets. Begin actions sit below the resting sculpture. Palette candidates are Balanced/Open/Suspended Chamber voicings at identical physiological timing.

Retention: UI exports retain 4096 events and report discarded count. Engine keeps bounded snapshot deltas/checkpoints; audio uses bounded voice/buffer/journal storage. Per-run command deduplication identities intentionally persist until reset. Explicit command-log retention details are in the runtime receipt.

Contract clarification, causal sub-tick collision: a newly launched opposing transit may yield a strictly interior crossing that rounds to its launch tick. Existing due collisions retain priority before arrivals; a collision first discovered from a launch at the current instant is resolved after that launch in the same complete timestamp batch. Causality must not be reversed to satisfy a phase ordering that was unknowable before launch. No wire schema, units or frozen fixture changes are required. Engine receipt carries the regression input.

## 2026-11-26 · v0.1 opening, gesture and review

Conduction opens before Begin in a rested state. The engine supplies its first automatic excitation at 0 simulated ms when playback starts. Duality uses independently paced branches with a 170 ms offset for B. Circulation retains its test oracles and its R0 reference protocols. Switching a running world starts a fresh run, and switching while paused leaves the fresh world ready to resume.

A site touch becomes a stimulus on release if the pointer has traveled less than 10 CSS px. A deliberate stroke disables each enabled physical path crossed, in stroke order. The geometric test excludes node approach and tangent contacts. Pointer cancellation ends the gesture, and a cut already submitted remains a normal engine command. Site and connection buttons stay available for keyboard operation.

The creator reported that the playable Circulation study worked well and requested swipe-to-cut. This is the usability review used to advance P1. Chamber Balanced and 4× dilation remain initial defaults pending a fixed-input listening comparison.
