# Adjustable pacing and AV nodal Wenckebach

## Plan

1. Tune the interactive Conduction preset with the shared ERP and conduction restitution laws. Sweep atrial drive rates, localize the dropped beat and verify the premature-impulse demonstration and retrograde conduction.
2. Give Conduction, Echo and both editions of Circulation a common, compact pacing control. Support direct entry, 10 ms steps, start and stop, and rate changes on a running simulation. Save the length using the edition's existing preferences.
3. Use the transport's simulation clock and command history for pacing. Display the measured conduction ratio and A–H interval in Conduction. Exercise the bundled interface on desktop and phone.

## Model check

A 48-beat atrial drive sweep in the production Conduction preset gives the following results. Cycle lengths are in simulation milliseconds.

| Cycle length | A:H |
|---|---|
| 390 | 1:1 |
| 380 | 8:7 |
| 370–360 | 4:3 |
| 350–320 | 3:2 |
| 310 | 2:1 |

The A→N link carries the dominant antegrade slowing. Its source decrement is 100 ms with a 150 ms time constant. The destination entry term adds up to 110 ms with a 150 ms time constant. The node's ERP ranges from 220 to 310 ms. The 360 ms trace shows refractory block at N. A premature atrial stimulus at 275 ms still reaches His and both ventricular branches. The original retrograde and fixed-reference tests pass.

At 360 ms, the three conducted A–H intervals in steady state measure 149, 222 and 250 ms. A Chromium check in Ladder view showed 4:3 Wenckebach at 360 ms, then 2:1 after changing the ongoing drive to 310 ms.

## Controls

The cycle length defaults to 600 ms and accepts 150–2000 ms. Pace targets A in Conduction, CSp in Echo and the selected ring site in Circulation. The pacing site stays fixed during a drive. Stop pacing ends the drive while the model continues. The transport logs each delivered stimulus in simulation time.

Automated verification covers the nominal pacing sweep, local block, reverse conduction, deterministic command replay, pause and reset behavior, rate bounds, and separate edition preferences. Chromium tests cover all three models and the standalone Circulation edition at desktop and 360 px touch sizes.
