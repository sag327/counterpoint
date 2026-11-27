# Continuous strand routing · 2026-11-27

Implementation on `organic-routing`, against `docs/organic-strands.md`.

## Actual geometry

`src/visuals/strands.js` caches resting and open strand coordinates. Non-ring width is a slowly varying spatial field, independent of link record order. Curvature and approximately parallel unrelated neighbors constrain width; a spatial lower envelope spreads narrow clearance over nearby samples. Transverse projected crossings retain independent routes. Cyclic outward tangent ordering pairs the facing rails of each sector, with stable link ID ties. Narrow sectors smoothly constrain only their facing rails, leaving the outside contour broad. A two-arm bend also routes its middle seam; a branch gathers its quiet seam onto the original site. Terminals taper.

One quintic bridge replaces the short port cubic and separate oscillation blend. It spans both arms, reaching up to 52 scaled pixels but never beyond 40% of either link. Endpoint position and finite-difference first and second derivatives come from the actual offset strands, scaled by the combined transition length. Inward and outward derivative conventions are separate. All sector width constraints run before bridge fitting, preventing a second junction from changing an already fitted short-link bridge.

The closed ring retains its existing periodic `threadShape` field and stroke treatment, preserving its folded morphology. Shared endpoint coordinates remain periodic. No Echo-specific branch or layout rule was added.

## Playback

A geometry or enabled-topology change rebuilds routes. Ordinary frames perform coordinate interpolation and stroke visibility only; neighborhood searches and fitting are outside steady-state playback. A quintic weight moves from the site's recorded refractory opening to the link's own passage field across the cached transition. Original wavehead clocks, swept-path envelope, deadlines and reduced-motion behavior remain. Resting coordinates remain on the original selectable paths. The middle stroke attenuates first at unresolved separation, with the same final coordinates and attenuation used for the moving light and collision/block glow. Ring stroke treatment is preserved.

## Verification

- `npm test`: 199 tests passed, including native Canvas visual tests.
- `npm run check:contract`: passed, including schema and engine fixture checks.
- `npm run build`: both standalone editions regenerated.
- `git diff --check`: passed.
- `node tests/host-integration.mjs`: passed its simulated 20-minute soak and 14 reset invocations; zero errors, duplicate/stale/late audio schedules and engine faults.
- `tests/strands.test.js`: six tests cover quintic endpoint position/tangent/curvature; record-order invariance; exact rest; common sector points; changed enabled topology; 40% reach; tight, short and coincident geometry; unrelated crossing rail survival; folded periodic ring; and middle-stroke attenuation.
- The Conduction visual test now probes the fitted common cleft rather than a hardcoded pixel belonging to the former short cubic. It still checks opening, recorded deadline recovery, idle distal-arm behavior, future-event stability and blocked-arrival light.

The parent delivery pass reports the final built app passed Chromium Echo checks at 390 px and 1080 px, including an activation/recovery frame sequence. Screenshots and detailed browser review are maintained by that pass.

## Limits

Tangent and curvature matching uses the existing 65-point link samples, so it is a numerical approximation of the underlying offset curve. Clearance uses sampled approximately parallel neighbors; projected transverse crossings deliberately do not constrain the whole arm. The fit does not solve a global collision-free routing optimization or guarantee freedom from self-intersection for every arbitrary adversarial layout. Width and derivative fallbacks guarantee finite coordinates for the tested coincident/short geometry. The approved ring keeps its prior periodic folds rather than adopting the non-ring clearance field.
