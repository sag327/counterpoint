# Collision dissipation

2026-11-27. Reused the refractory-block strand glow for wavefront collisions. In-link collisions use the engine's exact fractional collision position. Opposing arrivals that meet at a node use the coalesced activation's multiple incoming links, so the symmetric single-impulse experiment glows at the bottom meeting point too. The existing capture and music behavior is preserved; the overlay adds no events or notes.

Validation: self-contained build and desktop/phone Chromium interaction checks pass. Inspected phone-collision.png at simulation time 255 ms, just after the two initial waves meet. No engine changes.
