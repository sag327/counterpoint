# Circulation reweaving revision

2026-11-27. User requested varied organic morphologies and an impulse that unzips the ring as it travels.

Replaced node-centered whole-segment opening with a sampled swept-path presentation field. Each point opens only after a real engine transit crosses it, with a short smooth shoulder behind the tip. Passage records are precomputed per experiment; recovery uses interpolated neighboring ERP. Collisions truncate the swept path. Failed arrivals taper their visual disturbance before the destination and cannot reset that site's recovery. Engine dynamics are unchanged.

Three strands now use several unequal continuous folds and seam crossings around the whole ring, eliminating repeated per-segment pouches. Shape is deterministic and periodic, avoiding random flicker and preserving identical replay/scrub appearance. This remains an artistic interpolation between discrete engine sites, not a continuous electrophysiology solver.

Validation: 178 Node tests pass. Added causal opening checks in both directions, blocked endpoint recovery preservation, collision truncation and seamless circumference geometry. Chromium desktop/phone controls still pass without page errors or horizontal overflow. Updated screenshots and added zipper-front.png. A 120-frame synchronous scrub/render measurement averaged 0.59 ms CPU work per redraw in headless Chromium, excluding asynchronous GPU compositing; this is not a hardware-wide frame-rate guarantee.

Build: npm run build:weave. Output: dist/circulation-weave.html. Await user assessment of visual motion before integration into main Circulation.
