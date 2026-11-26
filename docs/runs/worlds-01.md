# Ticket 09a world engine receipt

Attempt 01 is ready for lead review. The dependency is the Circulation P0 candidate recorded in `STATUS.md`. Both worlds use the existing engine and contract 1.0.0. The run used Node v24.22.3 and Python 3.12.14 with `jsonschema`.

The production presets and editable factories are in [Conduction](../../src/worlds/conduction.js) and [Duality](../../src/worlds/duality.js). Their common link configuration lives in [feedforward.js](../../src/worlds/feedforward.js). Conduction starts S at 0 simulated ms. Duality uses two branches with first attempts at 0 and 170 ms. A, A1 and A2 have ERP values of 180, 200 and 220 ms respectively. The B nodes each use 240 ms ERP. Every Duality recovery tail is 150 ms, within the design's 120–180 ms range.

Run from the project root.

```sh
node --test tests/engine.test.js tests/worlds.test.js tests/integration.test.js
node tests/worlds-evidence.js | cmp - evidence/worlds-01.json
python3 tests/engine-contract.py evidence/worlds-01.json
npm run check:contract
```

All 27 engine, world and integration tests passed. The [eight actual engine traces](../../evidence/worlds-01.json) include complete input worlds, commands, and 449 emitted events. The v1 validator checked the worlds, commands, event identities, causal references and terminal transit events. The checked-in JSON matched fresh output byte for byte. The event assertions use [the same scenario definitions](../../tests/worlds-scenes.js) and expected timings from handoff §§5.2–5.3.

| Gate | Input in simulated ms | Observed |
| --- | --- | --- |
| E19 rested and steady Conduction | Fresh world, no commands, through 2000 | First activations were S 0, A 25, N 60, H 125, V1 150 and V2 170. S repeated at 800 and 1600. NH took 65 ms on the first beat and 65.920 ms on the next two. Both branches captured each time in order. |
| E19 premature capture | Stimulate A at 275 after a fresh reset | N accepted at 310 exactly at ERP with zero pre-capture recovery. NH took 155 ms. H captured at 465, V1 at 490 and V2 at 510. S advanced on its original schedule at 800. |
| E19 premature block | Stimulate A at 274 after a fresh reset | A captured and N blocked at 309 with 1 ms ERP left. The next intrinsic beat reproduced the steady case. |
| E09–11 prospective Conduction edits | Set NH base delay to 75 at 90, set V1 ERP to 200 at 160, stimulate A at 275 | The traveling NH wave still arrived at 125. The later NH wave launched at 310 and arrived at 475. V1 kept its previous deadline of 410 until capture at 500 established a new 700 deadline. |
| E20 Duality baseline | Fresh world, no commands, through 3400 | A captured at 0, 720, 1440, 2160 and 2880. B captured at 170, 1200, 2230 and 3260. A1/A2 followed A by 45/85 and B1/B2 followed B by 60/110. |
| E12 and E20 Duality independence | Stimulate focus A at 250 in one run. Set A cycle to 550 at 400 in another run. | After stimulation A next captured at 970. After the cycle edit A next captured at 950, then every 550. Both runs reproduced every B event's physiological fields and all three B node snapshots at the union of event times. Run-wide event and transit IDs differed when A's event count changed. |
| E13 automatic attempts across blocks | Set B cycle to 200 at 200, with B in its 240 ms ERP | B blocked at 400 and 800 with 10 and 40 ms ERP left respectively. The automatic attempts at 600 and 1000 captured and reached both downstream nodes. A captured at 0 and 720. |

The lead can rerun these checks during world integration. Plate 05 rendering and browser verification have separate evidence gates.
