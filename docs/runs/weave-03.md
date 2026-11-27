# Block dissipation on the strands

2026-11-27. Replaced the two floating block sparks with a localized glow traced directly over all three existing filament curves. A refractory block produces a brief pale blue-white catch of light, a small widening halo, and an 85 ms simulation-time fade (340 ms at default playback speed). This changes brightness only: no geometry reset, capture, note, or new propagating wave. Scrubbing deterministically reproduces the effect.

Validation: prototype build and Chromium desktop/phone control checks pass without page exceptions or horizontal overflow. Updated block screenshots inspected. Existing simulation and timing are unchanged.
