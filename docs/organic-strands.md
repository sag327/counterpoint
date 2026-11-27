# Continuous strand routing

## Visual target

In Echo on a 390 px phone, follow an outside strand from either side of the lower loop into the ventricular stem. It should make one relaxed sweep. The current short cubic at each port and the separate blend into a per-link oscillation can introduce a shoulder and immediate reverse bend. Preserve the open space while removing that seam. At rest the strands gather back onto the selectable sites and their original paths.

## Geometry pass

1. Use the existing arc-length samples and site/link identities. Cache routing data when geometry, scale or the enabled incident topology changes. Screen-space intersections have independent routes unless they share a simulation site.
2. At a two-arm bend, continue each facing outer rail into its counterpart and continue the seam through the bend. At a branch, sort the outward tangents cyclically and pair the facing rails bounding each intervening sector. Tie-break deterministically by stable link ID. Treat a terminal arm as a taper. Preserve periodic continuity on a closed ring.
3. Fit the transition over a meaningful length of both arms. Reserve at most roughly 40% of a short link per end so neighboring junctions cannot overwrite one another. Match the position, tangent and curvature of the *offset strand* on each side. A quintic Hermite bridge with arc-length-scaled first and second derivatives, or a comparably smooth interpolating spline, is suitable. Use separate inward and outward travel conventions when deriving endpoint tangents. Avoid an abrupt switch between cleft and outside handles as a branch angle changes.
4. Use a slowly varying, deterministic width/asymmetry field along continuous routes. Favor a broad outside sweep, a finer inside curve and a quiet third seam. Avoid independent phase resets at each link, random jitter and repeated bulges. Reordering link records must not change a route’s shape.
5. Bound maximum half-width by local curvature radius, clearance to unrelated neighbors and space inside an acute fork. Smooth the bound spatially to avoid making a dent at the closest sample. Use a finite fallback for short edges, near-parallel tangents and coincident samples. When the available width is too small to separate three strokes, attenuate the middle strand first. For a visual crossing, keep both route identities and avoid collapsing a whole arm merely because its projected distance briefly reaches zero.

## Playback

Retain the existing wavehead clock, swept-path opening, refractory deadlines and strand-light envelope. Interpolate cached resting and open routes using site recovery through the junction and each link’s own passage field farther down the arm. The displacement should meet smoothly at both ends of the transition. A junction capture briefly opens the common fork, while an idle arm gathers close to it. A blocked arrival only adds light. Use the same final strand coordinates for the moving trail and collision glow. Keep hit testing anchored to the original simulation geometry and preserve reduced-motion behavior.

## Acceptance and delivery

Inspect rest, newly open, half-recovered and recovered frames of the lower Echo fork at phone and desktop widths. Look for a continuous outside contour, smooth cleft, no double turn or detached node, and clear recovery with the glow faded. Compare the asymmetric Conduction fork and the closed Circulation ring. Exercise a tight fork, short link, unrelated crossing and changed arm ordering using synthetic geometry where needed. Verify stability and finite coordinates. Keep neighborhood searches and spline fitting out of the animation loop. Run the existing tests, regenerate both editions and release checksums, and record the actual verification and any limits in the handoff.
